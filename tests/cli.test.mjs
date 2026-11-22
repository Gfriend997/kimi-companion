import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

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

function offlineEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.MOONSHOT_API_KEY;
  return env;
}

test("review --base with an empty range fails instead of reviewing the last commit", (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-base-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...a], { cwd: repo });
  git("init", "-q");
  for (const n of ["one", "two"]) {
    fs.writeFileSync(path.join(repo, "a.txt"), `${n}\n`);
    git("add", "a.txt");
    git("commit", "-qm", n);
  }
  const r = spawnSync(process.execPath, [CLI, "review", "--base", "HEAD"], { cwd: repo, env: offlineEnv(), encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no diff to review against HEAD/);
});

test("setup --gate writes config that survives the scrubber", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-home-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  spawnSync(process.execPath, [CLI, "setup", "--gate", "on"], { env: offlineEnv({ KIMI_COMPANION_HOME: home }), encoding: "utf8" });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")), { stopReviewGate: true });
});

function repoWithChange(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-rv-"));
  // A detached background worker may still hold its log open on Windows.
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });
  const repo = path.join(dir, "repo");
  fs.mkdirSync(repo);
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...a], { cwd: repo });
  git("init", "-q");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\n");
  git("add", "a.txt");
  git("commit", "-qm", "init");
  fs.writeFileSync(path.join(repo, "a.txt"), "two\n");
  return { repo, home: dir };
}

test("review accepts --timeout-mins and --show-reasoning", (t) => {
  const { repo } = repoWithChange(t);
  const r = spawnSync(process.execPath, [CLI, "review", "--timeout-mins", "1", "--show-reasoning"], { cwd: repo, env: offlineEnv(), encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stderr, /Unknown option/i);
  assert.match(r.stderr, /MOONSHOT_API_KEY not set/);
});

test("review --background starts a job", (t) => {
  const { repo, home } = repoWithChange(t);
  const r = spawnSync(process.execPath, [CLI, "review", "--background"], { cwd: repo, env: offlineEnv({ KIMI_COMPANION_HOME: home }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Started background Kimi job/);
});

test("ask warns when the model ignores --effort", () => {
  const r = spawnSync(process.execPath, [CLI, "ask", "--model", "kimi-k2.7-code", "--effort", "high", "hi"], { env: offlineEnv(), encoding: "utf8" });
  assert.match(r.stderr, /warning: kimi-k2\.7-code ignores --effort high/);
});
