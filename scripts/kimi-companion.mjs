#!/usr/bin/env node
// Single entry point for the kimi-companion plugin.
// Subcommands: setup | ask | ask-worker | review | status | result | cancel
//
// Security invariant: MOONSHOT_API_KEY is only ever read from process.env inside
// lib/api.mjs and sent as an Authorization header. This script never prints,
// stores, or forwards the key value anywhere, and every write to disk or stdout
// passes through the scrubber.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { chat, listModels, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, EFFORT_LEVELS } from "./lib/api.mjs";
import { buildContent, DEFAULT_MAX_FILE_BYTES } from "./lib/attach.mjs";
import { companionHome, createJob, readJob, updateJob, listJobs, cancelJob } from "./lib/jobs.mjs";
import { scrub } from "./lib/scrub.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(SELF));
const MAX_DIFF_BYTES = 200 * 1024;

function fail(msg) {
  process.stderr.write(`${scrub(msg)}\n`);
  process.exit(1);
}

function out(msg) {
  process.stdout.write(`${scrub(msg)}\n`);
}

function configFile() {
  return path.join(companionHome(), "config.json");
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), "utf8")); } catch { return {}; }
}

function writeConfig(patch) {
  fs.mkdirSync(companionHome(), { recursive: true });
  const next = { ...readConfig(), ...patch };
  fs.writeFileSync(configFile(), JSON.stringify(next, null, 2));
  return next;
}

function preset(name) {
  if (!name) return null;
  // Name is used to build a path — keep it to a bare slug so no caller can walk
  // out of prompts/ and read an arbitrary file into a request body.
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(name)) throw new Error(`invalid preset name: ${name}`);
  const file = path.join(ROOT, "prompts", `${name}.md`);
  if (!fs.existsSync(file)) throw new Error(`unknown preset: ${name}`);
  return fs.readFileSync(file, "utf8");
}

function usageLine({ model, usage }) {
  if (!usage) return `[${model}]`;
  const cached = usage.prompt_tokens_details?.cached_tokens;
  return `[${model} · ${usage.prompt_tokens ?? "?"} prompt${cached ? ` (${cached} cached)` : ""} + ${usage.completion_tokens ?? "?"} completion tokens]`;
}

// ---- setup ----------------------------------------------------------------

async function cmdSetup(args) {
  const { values } = parseArgs({ args, options: { gate: { type: "string" } }, allowPositionals: false });
  const keyOk = Boolean(process.env.MOONSHOT_API_KEY);
  out(
    `MOONSHOT_API_KEY: ${keyOk
      ? "present in environment (value not shown)"
      : "NOT VISIBLE — set it as an OS-level environment variable and restart Claude Code, never a .env file"}`
  );

  if (keyOk) {
    try {
      const models = await listModels();
      out(`Moonshot API: reachable — models available: ${models.join(", ") || "(none returned)"}`);
    } catch (err) {
      out(`Moonshot API: UNREACHABLE — ${err.message}`);
      process.exit(1);
    }
  }

  if (values.gate) {
    if (!["on", "off"].includes(values.gate)) fail("--gate must be on or off");
    const cfg = writeConfig({ stopReviewGate: values.gate === "on" });
    out(`stop review gate: ${cfg.stopReviewGate ? "on" : "off"}`);
  } else {
    out(`stop review gate: ${readConfig().stopReviewGate ? "on" : "off"}`);
  }

  out("note: Kimi has no image or video generation endpoint — it reads images and video, it does not create them.");
  if (!keyOk) process.exit(1);
  out("setup OK");
}

// ---- ask ------------------------------------------------------------------

const ASK_OPTIONS = {
  file: { type: "string", multiple: true, default: [] },
  model: { type: "string", default: DEFAULT_MODEL },
  effort: { type: "string" },
  preset: { type: "string" },
  "max-tokens": { type: "string" },
  "max-file-mb": { type: "string" },
  "timeout-mins": { type: "string" },
  "show-reasoning": { type: "boolean", default: false },
  background: { type: "boolean", default: false }
};

function askSpecFrom(values, prompt) {
  if (values.effort && !EFFORT_LEVELS.includes(values.effort)) {
    throw new Error(`--effort must be one of ${EFFORT_LEVELS.join(", ")}`);
  }
  return {
    prompt,
    files: values.file ?? [],
    preset: values.preset ?? null,
    model: values.model ?? DEFAULT_MODEL,
    effort: values.effort ?? null,
    maxTokens: values["max-tokens"] ? Number(values["max-tokens"]) : DEFAULT_MAX_TOKENS,
    maxFileBytes: values["max-file-mb"] ? Number(values["max-file-mb"]) * 1048576 : DEFAULT_MAX_FILE_BYTES,
    timeoutMs: values["timeout-mins"] ? Number(values["timeout-mins"]) * 60000 : undefined,
    showReasoning: Boolean(values["show-reasoning"])
  };
}

async function runAsk(spec) {
  const messages = [];
  const system = preset(spec.preset);
  if (system) messages.push({ role: "system", content: system });
  messages.push({
    role: "user",
    content: buildContent(spec.prompt, spec.files, { maxBytes: spec.maxFileBytes })
  });
  return chat({
    messages,
    model: spec.model,
    maxTokens: spec.maxTokens,
    effort: spec.effort,
    ...(spec.timeoutMs ? { timeoutMs: spec.timeoutMs } : {})
  });
}

function renderAnswer(res, spec) {
  const parts = [];
  if (spec.showReasoning && res.reasoning) parts.push(`--- reasoning ---\n${res.reasoning}\n--- answer ---`);
  parts.push(res.text);
  parts.push(usageLine({ model: spec.model, usage: res.usage }));
  return parts.join("\n\n");
}

async function cmdAsk(args) {
  const { values, positionals } = parseArgs({ args, options: ASK_OPTIONS, allowPositionals: true });
  const prompt = positionals.join(" ").trim();
  if (!prompt && !(values.file ?? []).length) {
    fail('usage: ask "<prompt>" [--file path]... [--model m] [--effort low|high|max] [--preset rescue] [--background]');
  }
  const spec = askSpecFrom(values, prompt);

  if (values.background) {
    const job = createJob({ kind: spec.preset ?? "ask", prompt, spec: { ...spec, cwd: process.cwd() }, cwd: process.cwd() });
    const logFile = path.join(companionHome(), "jobs", `${job.id}.log`);
    const log = fs.openSync(logFile, "a");
    const child = spawn(process.execPath, [SELF, "ask-worker", job.id], {
      detached: true,
      stdio: ["ignore", log, log],
      cwd: process.cwd(),
      env: process.env
    });
    child.unref();
    updateJob(job.id, { pid: child.pid });
    out(`Started background Kimi job ${job.id} (worker pid ${child.pid}).`);
    out(`Check with: status --id ${job.id} · fetch with: result --id ${job.id}`);
    return;
  }

  const res = await runAsk(spec);
  out(renderAnswer(res, spec));
}

async function cmdAskWorker(args) {
  const id = args[0];
  const job = readJob(id);
  if (!job) fail(`job not found: ${id}`);
  updateJob(id, { status: "running", pid: process.pid });
  try {
    process.chdir(job.spec.cwd || job.cwd);
    const res = await runAsk(job.spec);
    updateJob(id, { status: "done", resultText: renderAnswer(res, job.spec), error: null });
  } catch (err) {
    updateJob(id, { status: "failed", error: err.message || String(err) });
  }
}

// ---- review ---------------------------------------------------------------

function gitDiff(base) {
  const range = base ? [base] : ["HEAD"];
  const r = spawnSync("git", ["diff", ...range], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (r.status !== 0) fail(`git diff failed: ${(r.stderr || "").trim()}`);
  let diff = r.stdout;
  if (!diff.trim()) {
    // fall back to the last commit so "review" works right after committing
    const last = spawnSync("git", ["diff", "HEAD~1..HEAD"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    diff = last.status === 0 ? last.stdout : "";
  }
  if (!diff.trim()) fail("no diff to review (working tree clean and no previous commit range)");
  if (Buffer.byteLength(diff) > MAX_DIFF_BYTES) diff = diff.slice(0, MAX_DIFF_BYTES) + "\n[diff truncated at 200KB]";
  return diff;
}

async function cmdReview(args) {
  const { values } = parseArgs({
    args,
    options: {
      adversarial: { type: "boolean", default: false },
      base: { type: "string" },
      model: { type: "string", default: DEFAULT_MODEL },
      effort: { type: "string" },
      "max-tokens": { type: "string" }
    },
    allowPositionals: false
  });
  const spec = askSpecFrom(values, `## Diff under review\n\n\`\`\`diff\n${gitDiff(values.base)}\n\`\`\``);
  spec.preset = values.adversarial ? "adversarial-review" : "review";
  const res = await runAsk(spec);
  out(renderAnswer(res, spec));
}

// ---- status / result / cancel ----------------------------------------------

function jobLine(j) {
  return `${j.id}  ${j.status.padEnd(9)}  ${j.kind}  ${new Date(j.createdAt).toLocaleString()}  ${(j.prompt || "").slice(0, 60)}`;
}

function cmdStatus(args) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } }, allowPositionals: false });
  if (values.id) {
    const j = readJob(values.id);
    if (!j) fail(`job not found: ${values.id}`);
    out(JSON.stringify(j, null, 2));
    return;
  }
  const jobs = listJobs();
  if (!jobs.length) { out("no Kimi jobs recorded"); return; }
  jobs.slice(0, 20).forEach((j) => out(jobLine(j)));
}

function cmdResult(args) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } }, allowPositionals: false });
  if (!values.id) fail("usage: result --id <job-id>");
  const j = readJob(values.id);
  if (!j) fail(`job not found: ${values.id}`);
  if (j.status === "running" || j.status === "queued") { out(`job ${j.id} still ${j.status}`); return; }
  if (j.error) out(`job ${j.id} ${j.status} — error: ${j.error}`);
  out(j.resultText || "(no output captured)");
}

function cmdCancel(args) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } }, allowPositionals: false });
  if (!values.id) fail("usage: cancel --id <job-id>");
  const j = cancelJob(values.id);
  out(`job ${j.id}: ${j.status}`);
}

// ---- dispatch ----------------------------------------------------------------

const [subcommand, ...rest] = process.argv.slice(2);
const commands = {
  setup: cmdSetup,
  ask: cmdAsk,
  "ask-worker": cmdAskWorker,
  review: cmdReview,
  status: cmdStatus,
  result: cmdResult,
  cancel: cmdCancel
};

const handler = commands[subcommand];
if (!handler) fail(`unknown subcommand: ${subcommand ?? "(none)"} — expected one of ${Object.keys(commands).join(", ")}`);
Promise.resolve(handler(rest)).catch((err) => fail(err.message || String(err)));
