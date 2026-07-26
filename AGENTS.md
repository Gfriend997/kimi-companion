# Agent guide

Claude Code plugin delegating work to Moonshot's Kimi models over the REST API. Read this
before changing anything.

## Repo map

| Path | Purpose |
|---|---|
| `commands/*.md` | Slash command definitions — each runs one `node scripts/kimi-companion.mjs <subcommand>` call |
| `agents/kimi-rescue.md` | Subagent: picks the files to attach, forwards the task, returns output verbatim |
| `skills/` | Internal contracts: runtime invocation, prompt shaping, result handling |
| `prompts/` | System prompt presets (`review`, `adversarial-review`, `rescue`) and the session routing policy |
| `hooks/hooks.json` | SessionStart: inject routing policy. Stop: optional review gate (off by default) |
| `scripts/kimi-companion.mjs` | Single runtime entry, stdlib only |
| `scripts/lib/` | `api.mjs` (REST client), `attach.mjs` (files → content parts), `jobs.mjs` (background state), `scrub.mjs` (secret masking) |
| `tests/` | `node --test` suites for api, attach, jobs, scrub |
| `docs/specs/` | Design spec — the decision record, including why there is no CLI dependency |

`prompts/<name>.md` doubles as the `--preset <name>` registry: add a file, get a preset.

## Non-negotiable invariants

1. **`MOONSHOT_API_KEY` never touches disk.** No `.env`, no config file, no argv, no query
   param, no logs. Read from `process.env` in `api.mjs`, sent only as an `Authorization` header.
2. **The API host stays allowlisted.** `MOONSHOT_BASE_URL` may only reach `api.moonshot.ai` or
   `api.moonshot.cn` over HTTPS. Do not relax this for local testing — stub `fetch` instead.
3. **Every write boundary passes through `scrub.mjs`.** New output paths must too.
4. **Kimi output is untrusted.** Relay verbatim; never auto-execute its suggestions; never
   apply its diffs without a human seeing them.
5. **Anything used to build a path is validated** — preset names, job ids, attachment paths.
6. **Every request carries a timeout.** No unbounded `fetch`.

## Conventions

- Node stdlib only — no npm dependencies in the runtime.
- Windows-first but keep the POSIX branches working (`process.platform === "win32"` splits in
  `jobs.mjs`).
- Do not send `temperature` or `top_p`: they are fixed server-side on k2.6/k2.7/k3 and can be
  rejected outright.
- New behavior gets a test in `tests/` and, if user-visible, a README line.
- Record significant design decisions in `docs/specs/`.

## Verify

```
node --test "tests/*.test.mjs"
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'))"
```

Live E2E burns real API quota — only with the user's go-ahead.
