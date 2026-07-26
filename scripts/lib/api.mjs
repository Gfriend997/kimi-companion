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

async function request(pathname, { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    if (err.name === "AbortError") throw new Error(`Moonshot API timed out after ${Math.round(timeoutMs / 60000)} min`);
    throw new Error(`Moonshot API request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw.slice(0, 1000);
    try {
      detail = JSON.parse(raw)?.error?.message ?? detail;
    } catch { /* keep raw text */ }
    throw new Error(`Moonshot API ${res.status}: ${detail}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Moonshot API returned non-JSON body: ${raw.slice(0, 200)}`);
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
  const body = await request("/chat/completions", {
    method: "POST",
    timeoutMs,
    body: { model, messages, max_tokens: maxTokens, ...reasoningParams(model, effort) }
  });
  return parseCompletion(body);
}
