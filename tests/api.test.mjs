import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  apiBase,
  apiKey,
  validModel,
  reasoningParams,
  parseCompletion,
  transportError,
  collectStream
} from "../scripts/lib/api.mjs";

// Feeds bytes to collectStream the way a socket would: arbitrary chunk boundaries.
async function* bytes(...chunks) {
  const enc = new TextEncoder();
  for (const c of chunks) yield enc.encode(c);
}

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

afterEach(() => {
  delete process.env.MOONSHOT_BASE_URL;
  delete process.env.MOONSHOT_API_KEY;
});

test("defaults to the global Moonshot endpoint", () => {
  assert.equal(apiBase(), "https://api.moonshot.ai/v1");
});

test("allows the other Moonshot region", () => {
  process.env.MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";
  assert.equal(apiBase(), "https://api.moonshot.cn/v1");
});

test("rejects a base URL pointed at another host", () => {
  process.env.MOONSHOT_BASE_URL = "https://evil.example.com/v1";
  assert.throws(() => apiBase(), /host not allowed/);
});

test("rejects a plaintext base URL", () => {
  process.env.MOONSHOT_BASE_URL = "http://api.moonshot.ai/v1";
  assert.throws(() => apiBase(), /must use https/);
});

test("rejects a malformed base URL", () => {
  process.env.MOONSHOT_BASE_URL = "not a url";
  assert.throws(() => apiBase(), /not a valid URL/);
});

test("apiKey demands the environment variable", () => {
  assert.throws(() => apiKey(), /MOONSHOT_API_KEY not set/);
  process.env.MOONSHOT_API_KEY = "sk-test";
  assert.equal(apiKey(), "sk-test");
});

test("model names are validated", () => {
  assert.equal(validModel("kimi-k3"), "kimi-k3");
  assert.throws(() => validModel("../etc/passwd"), /invalid model name/);
  assert.throws(() => validModel("kimi k3"), /invalid model name/);
});

test("reasoning knobs match the model family", () => {
  assert.deepEqual(reasoningParams("kimi-k3", "low"), { reasoning_effort: "low" });
  assert.deepEqual(reasoningParams("kimi-k2.6", "low"), { thinking: { type: "disabled" } });
  assert.deepEqual(reasoningParams("kimi-k2.6", "max"), {});
  assert.deepEqual(reasoningParams("kimi-k2.7-code", "low"), {}, "k2.7-code has thinking always on");
  assert.deepEqual(reasoningParams("kimi-k3", null), {});
  assert.throws(() => reasoningParams("kimi-k3", "medium"), /--effort must be one of/);
});

test("parseCompletion extracts text, reasoning and usage", () => {
  const res = parseCompletion({
    choices: [{ finish_reason: "stop", message: { content: " hi ", reasoning_content: "thought" } }],
    usage: { prompt_tokens: 3 }
  });
  assert.equal(res.text, "hi");
  assert.equal(res.reasoning, "thought");
  assert.deepEqual(res.usage, { prompt_tokens: 3 });
});

test("parseCompletion explains a reasoning-only truncation", () => {
  assert.throws(
    () => parseCompletion({ choices: [{ finish_reason: "length", message: { content: "" } }] }),
    /raise --max-tokens/
  );
});

test("parseCompletion rejects an empty body", () => {
  assert.throws(() => parseCompletion({}), /no completion/);
});

test("transportError names undici's transport timeout instead of 'fetch failed'", () => {
  const err = Object.assign(new TypeError("fetch failed"), {
    cause: { code: "UND_ERR_HEADERS_TIMEOUT" }
  });
  const msg = transportError(err, 600000).message;
  assert.match(msg, /UND_ERR_HEADERS_TIMEOUT/);
  assert.match(msg, /not a network error/);
  assert.doesNotMatch(msg, /^Moonshot API request failed: fetch failed$/);
});

test("transportError still reports the wrapper's own abort as a timeout", () => {
  const err = Object.assign(new Error("aborted"), { name: "AbortError" });
  assert.match(transportError(err, 600000).message, /timed out after 10 min/);
});

test("transportError appends an unknown error code rather than dropping it", () => {
  const err = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
  assert.match(transportError(err, 600000).message, /fetch failed \(ECONNRESET\)/);
});

test("collectStream accumulates content, reasoning, finish_reason and usage", async () => {
  const body = await collectStream(
    bytes(
      sse({ choices: [{ delta: { reasoning_content: "think" } }] }),
      sse({ choices: [{ delta: { content: "he" } }] }),
      sse({ choices: [{ delta: { content: "llo" }, finish_reason: "stop" }] }),
      sse({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 2 } }),
      "data: [DONE]\n\n"
    )
  );
  const res = parseCompletion(body);
  assert.equal(res.text, "hello");
  assert.equal(res.reasoning, "think");
  assert.equal(res.finish, "stop");
  assert.deepEqual(res.usage, { prompt_tokens: 7, completion_tokens: 2 });
});

test("collectStream reassembles an SSE event split across chunk boundaries", async () => {
  const event = sse({ choices: [{ delta: { content: "split" }, finish_reason: "stop" }] });
  const body = await collectStream(bytes(event.slice(0, 11), event.slice(11, 25), event.slice(25)));
  assert.equal(parseCompletion(body).text, "split");
});

test("collectStream preserves the reasoning-only truncation error", async () => {
  const body = await collectStream(
    bytes(
      sse({ choices: [{ delta: { reasoning_content: "thought and thought" } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "length" }] })
    )
  );
  assert.throws(() => parseCompletion(body), /raise --max-tokens/);
});

test("collectStream surfaces an error event mid-stream", async () => {
  await assert.rejects(
    () => collectStream(bytes(sse({ error: { message: "rate limit reached" } }))),
    /rate limit reached/
  );
});
