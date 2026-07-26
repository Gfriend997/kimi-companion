import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// jobs.mjs reads KIMI_COMPANION_HOME at call time, so a static import is safe here.
import { createJob, readJob, updateJob, listJobs, cancelJob } from "../scripts/lib/jobs.mjs";

let home;
before(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-jobs-"));
  process.env.KIMI_COMPANION_HOME = home;
});
after(() => {
  delete process.env.KIMI_COMPANION_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

test("job state lives under the configured home", () => {
  const job = createJob({ kind: "ask", prompt: "hello" });
  assert.ok(fs.existsSync(path.join(home, "jobs", `${job.id}.json`)));
  assert.equal(readJob(job.id).status, "queued");
});

test("updates merge and stamp updatedAt", () => {
  const job = createJob({ kind: "ask", prompt: "x" });
  const next = updateJob(job.id, { status: "done", resultText: "answer" });
  assert.equal(next.status, "done");
  assert.equal(next.resultText, "answer");
  assert.equal(next.kind, "ask", "unpatched fields survive");
  assert.ok(Date.parse(next.updatedAt) >= Date.parse(job.updatedAt));
});

test("secrets are scrubbed before job state hits disk", () => {
  const job = createJob({ kind: "ask", prompt: "my key is sk-" + "c".repeat(48) });
  const onDisk = fs.readFileSync(path.join(home, "jobs", `${job.id}.json`), "utf8");
  assert.ok(!onDisk.includes("c".repeat(48)));
  assert.ok(onDisk.includes("[REDACTED]"));
});

test("listJobs returns newest first", () => {
  const stamps = listJobs().map((j) => Date.parse(j.createdAt));
  assert.ok(stamps.length >= 3);
  for (let i = 1; i < stamps.length; i++) assert.ok(stamps[i - 1] >= stamps[i], "createdAt descending");
});

test("cancel marks a queued job cancelled and is idempotent", () => {
  const job = createJob({ kind: "ask", prompt: "y" });
  assert.equal(cancelJob(job.id).status, "cancelled");
  assert.equal(cancelJob(job.id).status, "cancelled");
});

test("bad job ids are rejected", () => {
  assert.throws(() => readJob("../../etc/passwd"), /invalid job id/);
});
