import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { apiBase, apiKey, validModel, reasoningParams, parseCompletion } from "../scripts/lib/api.mjs";

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
