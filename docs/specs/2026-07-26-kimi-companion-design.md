# kimi-companion design spec

Date: 2026-07-26
Status: approved (implemented in this repo)
Author: Gary Wong + Claude

## Problem

The `gemini-companion` plugin proved that a second frontier model wired into Claude Code
is useful: delegate a task, get an independent review, generate an image. Moonshot's Kimi
models are strong at long-context reasoning and code review, and the account already has a
key on this machine. We want the same operating model against Kimi, without copying
capabilities Kimi does not have.

## Capability findings (verified live, 2026-07-26)

Probed `https://api.moonshot.ai/v1` with the account key.

| Question | Answer |
|---|---|
| Endpoint | OpenAI-compatible `POST /v1/chat/completions`. `api.moonshot.cn` rejects this key (401) — global endpoint only |
| Models live on the account | `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`, `kimi-k2.6` |
| Image generation | **Does not exist.** No endpoint, no model |
| Video generation | **Does not exist** |
| Image input | Yes — `{"type":"image_url","image_url":{"url":"data:image/png;base64,…"}}` accepted and answered |
| Video input | Yes — `video_url` part type is recognized (a malformed payload returns "invalid video file", not "unknown type") |
| Context window | `kimi-k3` 1M tokens; `kimi-k2.7-code` / `k2.6` 256K |
| Reasoning | Models emit `message.reasoning_content` and spend completion budget on it. A 20-token cap produced empty `content` and `finish_reason: "length"` |
| Reasoning control | `kimi-k3`: `reasoning_effort: low\|high\|max` (default `max`). `kimi-k2.6`: `thinking: {"type":"disabled"}`. `kimi-k2.7-code`: thinking always on |
| Sampling | `temperature` and `top_p` are fixed on k2.6/k2.7/k3 — sending them risks `invalid_request_error`, so we never send them |

So the Gemini plugin's `/imagine` has no counterpart here. Its inverse does: Kimi ingests
images, video, and very large files. That becomes this plugin's distinctive command.

## Agentic CLI decision

Moonshot ships **Kimi Code CLI** (`kimi`, MIT, TypeScript) with real headless flags
(`-p`, `--output-format`, `-m`, `--yolo`, `--plan`, `-c`). It is the natural analogue of the
`gemini` CLI, but v1 does not depend on it:

1. The only documented install path is `irm https://code.kimi.com/kimi-code/install.ps1 | iex`
   — a remote script piped into a shell. The npm packages named `kimi` / `kimi-code` are
   unrelated third-party projects (verified against the registry), so the "just npm install"
   advice circulating in blog posts is wrong and would install someone else's code.
2. Non-interactive authentication is undocumented; the CLI expects an interactive `/login`.
   A background job that silently blocks on an auth prompt is a bad failure mode.

**Decision: REST-only v1.** Everything runs through `fetch` against the documented API with
the key from the environment. `rescue` therefore returns a plan plus unified diffs rather
than editing files itself; Claude Code applies them, which also keeps a human in the loop on
every write. If Moonshot documents headless auth, a `--cli` execution path can be added
behind the existing `rescue` command without changing its surface.

Trade-off accepted: no autonomous multi-turn tool use by Kimi. Gained: no supply-chain
exposure, no interactive-auth deadlocks, one dependency-free runtime, and writes stay
reviewable.

## Architecture

One Node entry script, stdlib only, four libraries:

```
scripts/kimi-companion.mjs      dispatch + command implementations
scripts/lib/api.mjs             REST client (host allowlist, key handling, response parsing)
scripts/lib/attach.mjs          file → message content parts (text / image / video)
scripts/lib/jobs.mjs            background job state, outside any repo
scripts/lib/scrub.mjs           secret masking at every write boundary
```

All four commands that talk to Kimi share one engine: build messages
(system prompt template + user text + attachments) → one REST call → print `content`.
`--background` detaches a worker that writes the result into job state.

### Command surface

| Command | Runtime call | Notes |
|---|---|---|
| `setup` | — | Key presence (never the value), reachable API, model list, gate toggle |
| `ask` | `ask` | Long-context Q&A; `--file` repeatable for text, images, video |
| `review` | `review` | Working diff (falls back to last commit) + review template |
| `adversarial-review` | `review --adversarial` | Hostile template |
| `rescue` | `ask --preset rescue` | Implementer prompt: root cause, plan, unified diffs |
| `status` / `result` / `cancel` | job state | Same semantics as gemini-companion |
| `transfer` | `ask --preset rescue` | Claude summarizes the session into the prompt |

### Attachments

- Images inline as base64 data URLs (`image_url` part). Allowlist: png, jpg, jpeg, webp, gif, bmp.
- Video inline as base64 data URLs (`video_url` part). Allowlist: mp4, mov, webm, mkv, avi.
- Anything else is treated as UTF-8 text and inlined in a fenced block labeled with its path.
- Per-file cap 20 MB, total request cap 40 MB, both configurable by flag. Larger media must be
  trimmed or downscaled — the Files API path is deliberately deferred until there is a real need.

## Security model

Same invariants as `gemini-companion`, plus two the REST-first design makes necessary.

1. **`MOONSHOT_API_KEY` is read from the environment only** — never a `.env`, never a config
   file, never argv, never a query parameter, never logged. It is sent only as an
   `Authorization: Bearer` request header.
2. **Base URL host allowlist.** `MOONSHOT_BASE_URL` may override the endpoint, but only to
   `api.moonshot.ai` or `api.moonshot.cn`, and only over HTTPS. Without this, a poisoned
   environment variable would redirect every request — and the key — to an attacker's host.
   This is the one genuinely new attack surface versus the CLI-based plugin.
3. **Everything written to job state or logs passes `scrub.mjs`**: the `sk-…` key shape,
   labeled `key/token/secret/bearer/password` assignments, and the live env value.
4. **Job state lives outside any repo** (`%LOCALAPPDATA%\kimi-companion\`) so prompts and
   model output are never committed by accident.
5. **Model output is untrusted.** Commands relay it verbatim and never auto-execute it.
   Because `rescue` returns diffs, a human reads them before they are applied.
6. **Attachment paths are validated**: resolved, must be an existing regular file, size-capped,
   and never globbed from model output.
7. **Model names are regex-validated** before they reach a URL or request body.
8. **Timeouts on every request** (default 10 min) with `AbortController`, so a hung call cannot
   wedge a hook or a background worker.

## Definition of done

- `node --test "tests/*.test.mjs"` green.
- Live: `setup`, `ask`, `ask --file <png>`, `review`, `rescue`, `--background` + `status` +
  `result`, `cancel` all exercised against the real API.
- README documents the no-image-generation finding so nobody re-litigates it.
- Private GitHub repo `Gfriend997/kimi-companion` created and pushed.

## Known limitations

- No autonomous file edits (see CLI decision above).
- Video and large media inline as base64; no Files API upload path yet.
- `transfer` is a context-handoff summary, not a session import.
- Stop-review gate reviews only dirty working trees and never blocks on its own failure.
