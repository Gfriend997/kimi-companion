import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HOOK = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "scripts", "stop-review-gate-hook.mjs");

// A repo with one commit and the gate switched on. The key is stripped from the
// env, so a review that does run fails fast offline and the gate reports "skipped".
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-gate-"));
  const home = path.join(dir, "home");
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ stopReviewGate: true }));
  const repo = path.join(dir, "repo");
  fs.mkdirSync(repo);
  const git = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\n");
  git("add", "a.txt");
  git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "init");
  const env = { ...process.env, KIMI_COMPANION_HOME: home };
  delete env.MOONSHOT_API_KEY;
  const runHook = () => spawnSync(process.execPath, [HOOK], { cwd: repo, env, encoding: "utf8" });
  return { dir, repo, runHook };
}

test("gate ignores a tree whose only changes are untracked files", (t) => {
  const { dir, repo, runHook } = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(repo, "new.txt"), "untracked\n");
  const r = runHook();
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "", "gate must not run review for untracked-only changes");
});

test("gate runs review when a tracked file changed", (t) => {
  const { dir, repo, runHook } = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(repo, "a.txt"), "two\n");
  const r = runHook();
  assert.equal(r.status, 0);
  assert.match(r.stderr, /kimi stop-review gate skipped: .*MOONSHOT_API_KEY not set/s);
});

test("gate does nothing on a clean tree", (t) => {
  const { dir, runHook } = setup();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const r = runHook();
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});
