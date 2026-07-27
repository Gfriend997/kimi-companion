import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const CLI = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "scripts", "kimi-companion.mjs");

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

// The sync subcommands (status/result/cancel) throw before any promise exists,
// so a validation failure used to escape the dispatcher and print a stack trace.
test("a rejected job id fails with a clean message, not a stack trace", () => {
  const r = run("cancel", "--id", "../../etc");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid job id/);
  assert.doesNotMatch(r.stderr, /at \w+ \(file:/, "stack frames leaked to the user");
});

test("an unknown subcommand names the valid ones", () => {
  const r = run("frobnicate");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown subcommand: frobnicate/);
});
