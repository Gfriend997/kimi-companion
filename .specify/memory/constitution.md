# kimi-companion Constitution

Status: PROPOSED 2026-11-22. This file restates the existing invariants and conventions in `AGENTS.md`. Gary has not ratified it yet. Where this file and `AGENTS.md` differ, `AGENTS.md` wins until it is ratified.

## Core principles

1. **The key never touches disk.** `MOONSHOT_API_KEY` is read from `process.env` in `api.mjs` and sent only as an `Authorization` header. It never goes in `.env`, config, argv, query params or logs.
2. **The API host stays allowlisted.** `MOONSHOT_BASE_URL` may only reach `api.moonshot.ai` or `api.moonshot.cn` over HTTPS. Tests stub `fetch`; they do not relax the allowlist.
3. **Every write boundary passes through `scrub.mjs`.**
4. **Kimi output is untrusted.** Relay it verbatim. Never auto-execute its suggestions, and never apply its diffs before a human has seen them.
5. **Anything used to build a path is validated**, including preset names, job ids and attachment paths.
6. **Every request has a timeout.** No unbounded `fetch`.
7. **Node standard library only.** The runtime has no npm dependencies.
8. **Windows first, with the POSIX branches kept working.**

## Governance

Changes follow `.specify/pre-code-gate.md`: the spec, plan, tasks and decisions are written, and Gary approves them, before any code. Model recommendations (Jev, Grok, Gemini, Kimi, Codex) never count as approval.
