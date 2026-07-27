// Moonshot (Kimi) REST client. OpenAI-compatible chat completions.
//
// Security invariants enforced here:
//  - MOONSHOT_API_KEY is read from the environment at call time and sent only as
//    an Authorization header. Never argv, never a query parameter, never on disk.
//  - The endpoint host is allowlisted. MOONSHOT_BASE_URL may point at a different
//    Moonshot region but nowhere else: an unchecked override would redirect every
//    request, and the key with it, to whatever host poisoned the environment.
//  - Model names are validated before they reach a request body.

export const DEFAULT_MODEL = "kimi-k3";
export const DEFAULT_MAX_TOKENS = 8192;
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
export const EFFORT_LEVELS = ["low", "high", "max"];

const ALLOWED_HOSTS = new Set(["api.moonshot.ai", "api.moonshot.cn"]);
const DEFAULT_BASE = "https://api.moonshot.ai/v1";
const MODEL_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function apiBase() {
  const raw = process.env.MOONSHOT_BASE_URL || DEFAULT_BASE;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`MOONSHOT_BASE_URL is not a valid URL`);
  }
  if (url.protocol !== "https:") throw new Error("MOONSHOT_BASE_URL must use https");
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(
      `MOONSHOT_BASE_URL host not allowed: ${url.hostname} (allowed: ${[...ALLOWED_HOSTS].join(", ")})`
    );
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function apiKey() {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) {
    throw new Error(
      "MOONSHOT_API_KEY not set in the environment. Add it as an OS-level environment variable and restart Claude Code — never a .env file."
    );
  }
  return key;
}

export function validModel(model) {
  if (!MODEL_RE.test(model)) throw new Error(`invalid model name: ${model}`);
  return model;
}

// kimi-k3 exposes reasoning_effort; kimi-k2.6 exposes a thinking toggle; k2.7-code
// has thinking permanently on. Only send a knob the chosen model actually accepts.
export function reasoningParams(model, effort) {
  if (!effort) return {};
  if (!EFFORT_LEVELS.includes(effort)) throw new Error(`--effort must be one of ${EFFORT_LEVELS.join(", ")}`);
  if (model.startsWith("kimi-k3")) return { reasoning_effort: effort };
  if (model.startsWith("kimi-k2.6")) return effort === "low" ? { thinking: { type: "disabled" } } : {};
  return {};
}

export function parseCompletion(body) {
  const choice = body?.choices?.[0];
  if (!choice) throw new Error("no completion in API response");
  const message = choice.message ?? {};
  const text = typeof message.content === "string" ? message.content.trim() : "";
  if (!text && choice.finish_reason === "length") {
    throw new Error(
      "model spent its whole token budget on reasoning and returned no answer — raise --max-tokens or use --effort low"
    );
  }
  if (!text) throw new Error(`empty response from model (finish_reason: ${choice.finish_reason ?? "unknown"})`);
  return {
    text,
    reasoning: typeof message.reasoning_content === "string" ? message.reasoning_content : "",
    finish: choice.finish_reason ?? null,
    usage: body.usage ?? null
  };
}

// Node's fetch is undici, whose headersTimeout and bodyTimeout both default to
// 300s and cannot be changed without adding undici as a dependency. A dropped
// socket surfaces as the bare string "fetch failed", which reads like a network
// blip and invites a retry that is guaranteed to fail the same way. Keep the
// real code.
export function transportError(err, timeoutMs) {
  if (err.name === "AbortError") {
    return new Error(`Moonshot API timed out after ${Math.round(timeoutMs / 60000)} min`);
  }
  const code = err.cause?.code ?? err.code;
  if (code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
    return new Error(
      `Moonshot API hit undici's 300s transport timeout (${code}) — this is not a network error, ` +
      `and retrying unchanged will fail identically. Lower --max-tokens or --effort.`
    );
  }
  return new Error(`Moonshot API request failed: ${err.message}${code ? ` (${code})` : ""}`);
}

// Accumulates an OpenAI-style SSE completion into the same shape parseCompletion
// already understands, so streaming and non-streaming share one set of error
// semantics. Events are reassembled across chunk boundaries: a socket splits
// wherever it likes, including mid-JSON.
export async function collectStream(stream) {
  const decoder = new TextDecoder();
  let text = "";
  let reasoning = "";
  let usage = null;
  let finish = null;

  const handle = (line) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return; // a keep-alive or comment frame, not a completion event
    }
    if (event.error) {
      throw new Error(`Moonshot API stream error: ${event.error.message ?? JSON.stringify(event.error)}`);
    }
    const choice = event.choices?.[0];
    if (choice) {
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string") text += delta.content;
      if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    if (event.usage) usage = event.usage;
  };

  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handle(line.replace(/\r$/, ""));
  }
  buffer += decoder.decode();
  if (buffer.trim()) handle(buffer.replace(/\r$/, ""));

  return {
    choices: [{ message: { content: text, reasoning_content: reasoning }, finish_reason: finish }],
    usage
  };
}

async function request(pathname, { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // The timer stays armed until the body is fully consumed. On the streaming
  // path that read *is* the generation, so clearing it any earlier would leave
  // long completions with no timeout at all.
  try {
    let res;
    try {
      res = await fetch(`${apiBase()}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
    } catch (err) {
      throw transportError(err, timeoutMs);
    }

    // An error response is JSON even when the request asked for a stream.
    if (!res.ok) {
      const raw = await res.text();
      let detail = raw.slice(0, 1000);
      try {
        detail = JSON.parse(raw)?.error?.message ?? detail;
      } catch { /* keep raw text */ }
      throw new Error(`Moonshot API ${res.status}: ${detail}`);
    }

    if (body?.stream) {
      try {
        return await collectStream(res.body);
      } catch (err) {
        throw err.message?.startsWith("Moonshot API") ? err : transportError(err, timeoutMs);
      }
    }

    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`Moonshot API returned non-JSON body: ${raw.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function listModels({ timeoutMs = 30000 } = {}) {
  const body = await request("/models", { timeoutMs });
  return (body?.data ?? []).map((m) => m.id).filter(Boolean);
}

export async function chat({
  messages,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  effort,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  validModel(model);
  // temperature/top_p are fixed server-side on k2.6/k2.7/k3 — sending them can be
  // rejected outright, so the request carries only what every model accepts.
  //
  // stream: true is not about progress output. Non-streaming responses emit no
  // headers until generation finishes, so undici's 300s headersTimeout killed
  // every completion that ran longer than five minutes. Streaming makes headers
  // arrive at once and each chunk resets bodyTimeout, which leaves timeoutMs as
  // the only real deadline.
  const body = await request("/chat/completions", {
    method: "POST",
    timeoutMs,
    body: {
      model,
      messages,
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      ...reasoningParams(model, effort)
    }
  });
  return parseCompletion(body);
}
