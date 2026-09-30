# kimi-companion

Claude Code plugin that delegates work to Moonshot's Kimi models: long-context analysis,
image and video understanding, code review, adversarial review, delegated tasks, and
background jobs. Sibling to [gemini-companion](https://github.com/Gfriend997/gemini-companion),
rebuilt for the Moonshot API.

The idea is not original. It is OpenAI's [codex-plugin-cc](https://github.com/openai/codex-plugin-cc),
which established the pattern of driving a second model from inside Claude Code and set the
command surface both companions follow. See [Credits](#credits).

**Kimi does not generate images or video.** There is no such endpoint. Kimi *reads* images and
video — screenshots, UI recordings, diagrams — and reasons over them. For raster image
generation use a model that has it.

## Requirements

- Node.js 18+ (no npm dependencies)
- A Moonshot API key from the [Moonshot console](https://platform.moonshot.ai/console/api-keys)
- That key exported as an **OS-level environment variable** named `MOONSHOT_API_KEY`

> **Export the key into your environment. Never put it in a `.env` file.**
>
> This plugin does not read `.env` files and never will. A `.env` sitting in a working
> directory is one forgotten `.gitignore` line away from being committed, and once a key is in
> git history, rotating it is the only real fix. Environment variables leave nothing behind in
> the repo. Same rule for any config file, shell script, or command you type with the key
> inline — the key belongs in your environment, not in your project.

Export the key, then **restart Claude Code** so the new value is inherited by the plugin's
processes:

```powershell
# Windows (PowerShell) — persists for your user account
setx MOONSHOT_API_KEY "your-key-here"
```

```bash
# macOS / Linux — add to ~/.zshrc or ~/.bashrc, then reopen the shell
export MOONSHOT_API_KEY="your-key-here"
```

Accounts on the mainland-China endpoint should also set `MOONSHOT_BASE_URL` to
`https://api.moonshot.cn/v1`. Those two hosts are the only values the plugin accepts.

Developed and tested on Windows. POSIX code paths exist but are untested — reports welcome.

## Install

In Claude Code:

```
/plugin marketplace add Gfriend997/kimi-companion
/plugin install kimi-companion
```

If the repo is private or you want to run a local checkout, point the marketplace at the
directory instead:

```
/plugin marketplace add C:/path/to/kimi-companion
/plugin install kimi-companion
```

Then verify the key and connectivity:

```
/kimi-companion:setup
```

`setup` reports key presence, API reachability, and the model list. It never prints the key
value.

## Quick start

```
/kimi-companion:ask --file screenshot.png why is this layout breaking?
/kimi-companion:ask --file build.log what caused the first failure?
/kimi-companion:review                      # Kimi reviews your working diff
/kimi-companion:rescue why does tests/jobs.test.mjs flake on CI?
```

## Commands

| Command | What it does |
|---|---|
| `/kimi-companion:setup` | Check key presence + API reachability + model list; `--gate on\|off` toggles the stop-review gate |
| `/kimi-companion:ask` | One question, optionally over attached files (`--file`, repeatable) |
| `/kimi-companion:review` | Kimi reviews your current diff (falls back to last commit) |
| `/kimi-companion:adversarial-review` | Hostile review pass hunting for breakage |
| `/kimi-companion:rescue` | Delegate a task; the subagent picks the files, Kimi returns a plan and diffs |
| `/kimi-companion:status` | List background jobs (`--id` for one) |
| `/kimi-companion:result` | Fetch a finished job's output |
| `/kimi-companion:cancel` | Kill a running background job |
| `/kimi-companion:transfer` | Summarize the current session into a Kimi task (context handoff) |

Common flags: `--model` (default `kimi-k3`), `--effort low|high|max`, `--max-tokens`,
`--max-file-mb`, `--timeout-mins`, `--background`, `--show-reasoning`.

## Models

| Model | Context | Use it for |
|---|---|---|
| `kimi-k3` (default) | 1M | Long-context sweeps, images, video, general reasoning |
| `kimi-k2.7-code` | 256K | Code-heavy reasoning; thinking always on |
| `kimi-k2.7-code-highspeed` | 256K | Same, faster and cheaper |
| `kimi-k2.6` | 256K | General; supports `--effort low` to switch thinking off |

`temperature` and `top_p` are fixed server-side on these models, so the plugin never sends
them. All of them spend completion budget on reasoning: if you get an empty answer with a
`length` finish, raise `--max-tokens` or drop to `--effort low`.

Completions are streamed, so a large `--max-tokens` is safe: `--timeout-mins` (default 10)
is the only deadline.

## Cost guards

- Completion budget defaults to 8192 tokens (`--max-tokens` raises it). Completions are
  streamed, so a large value is safe — `--timeout-mins` (default 10) is the only deadline,
  and a hung call cannot run forever.
- Attachment caps stop one stray binary from inflating a request: 20 MB per file
  (`--max-file-mb`), 40 MB per request, 4 MB per text file.
- `--effort low` switches thinking off on models that support it, cutting reasoning-token
  spend on questions that don't need it.

## Attachments

`--file` is repeatable and accepts:

- **Images** — png, jpg, jpeg, webp, gif, bmp (inline base64)
- **Video** — mp4, mov, webm, mkv, avi (inline base64)
- **Anything else** — read as UTF-8 text and inlined, labeled with its path
- **Binary documents are rejected** (PDF, Word, Excel, PowerPoint, OpenDocument, zip, epub, or any file with a NUL byte in its first 8 KB): convert to markdown first (MarkItDown) and attach the `.md`

Limits: 20 MB per file (`--max-file-mb`), 40 MB per request, 4 MB per text file. Larger media
must be trimmed or downscaled — there is no Files API upload path yet.

## Security model

- **The API key never touches disk.** It is read from `process.env` at call time and sent only
  as an `Authorization: Bearer` header — never argv, never a query parameter, never logged.
- **The endpoint host is allowlisted.** `MOONSHOT_BASE_URL` can only point at `api.moonshot.ai`
  or `api.moonshot.cn`, over HTTPS. An unchecked override would redirect every request, and the
  key with it.
- Everything written to job state or logs passes a scrubber (`sk-…` shape, labeled tokens, and
  the live env value).
- Job state lives outside any repo: `%LOCALAPPDATA%\kimi-companion\` on Windows,
  `~/.local/share/kimi-companion/` elsewhere.
- Attachment paths are validated (must exist, must be a regular file, size-capped) and prompt
  presets are slug-validated, so nothing can walk out of `prompts/`.
- Every request has a timeout (default 10 min), so a hung call cannot wedge a hook or worker.
- Kimi's output is treated as untrusted: commands relay it verbatim and never auto-execute it.
  Because `rescue` returns diffs rather than editing files, a human sees every write.

## Testing

```
node --test "tests/*.test.mjs"
```

Live end-to-end (uses your key, makes real API calls): run `setup`, an `ask`, an `ask --file`
with an image, `review`, a `--background` job plus `status`/`result`/`cancel`.

The entry script's subcommands match the slash command names, except `rescue`,
`adversarial-review`, and `transfer`, which are `ask` runs with a different prompt preset.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `MOONSHOT_API_KEY not set` | The variable was set after Claude Code started. Restart Claude Code — child processes inherit the environment at launch. |
| `MOONSHOT_BASE_URL host not allowed` | Only `api.moonshot.ai` and `api.moonshot.cn` are accepted, over HTTPS. Unset the variable to fall back to the default. |
| Empty answer with a `length` finish reason | Reasoning consumed the whole completion budget. Raise `--max-tokens` or drop to `--effort low`. |
| `file too large` on `--file` | 20 MB per file, 40 MB per request, 4 MB per text file. Downscale or trim; there is no Files API upload path yet. |
| Slash commands missing after install | Marketplace changes need a session restart. |

## Roadmap / TODO

- [ ] **Evaluate a secret manager instead of a plain environment variable.** A machine-wide env
  var is readable by every process running as your user and can leak through crash dumps or a
  careless `env` in a shell transcript. Options worth testing: the
  [1Password CLI](https://developer.1password.com/docs/cli/secret-references/) (`op run -- claude`,
  injecting `MOONSHOT_API_KEY` from a secret reference so the value exists only for the lifetime
  of the process), the OS keychain (Windows Credential Manager, macOS Keychain, `libsecret`), or
  short-lived tokens if Moonshot ships them. Decide whether the plugin reads the secret itself or
  stays env-only and leaves injection to the launcher — env-only is the smaller attack surface and
  keeps the current "key never touches disk" invariant intact. Whatever wins should land in both
  companions identically.

## Routing policy

A `SessionStart` hook injects `prompts/routing-policy.md` into Claude's context each session:
image/video understanding and very large single-pass analysis auto-route to `ask`; delegation
and adversarial review ask first; generation requests are explicitly routed away. Edit that
file to change routing; restart the session to pick it up.

## Architecture

One Node entry script (`scripts/kimi-companion.mjs`), stdlib only. Four commands share one
engine: build messages (preset + prompt + attachments) → one REST call → print. Libraries:
`api.mjs` (REST client, host allowlist), `attach.mjs` (files → content parts), `jobs.mjs`
(background state), `scrub.mjs` (secret masking).

## Credits

Original idea and command surface: **[openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc)**
(Apache License 2.0, Copyright OpenAI). That plugin worked out the pattern this one copies —
slash commands for delegate/review/status/result/cancel, background jobs with an id you poll,
and a companion model that returns text for a human to act on rather than editing your files
behind your back. The design decisions worth having were theirs first. This plugin reached
that surface by way of the author's [gemini-companion](https://github.com/Gfriend997/gemini-companion) (MIT).

No third-party source code was copied. The runtime here was written fresh against the Moonshot
REST API and shares no codebase with either predecessor. This plugin is MIT licensed and is not
affiliated with or endorsed by OpenAI or Moonshot AI.

## Known limitations

- **No autonomous file edits.** Kimi Code CLI exists but its only install path is a remote
  script piped into a shell, and headless auth is undocumented — see
  `docs/specs/2026-07-26-kimi-companion-design.md`. Diffs come back for Claude to apply.
- No image or video generation (Moonshot has no such endpoint).
- Media is inlined as base64; no Files API upload path yet.
- `transfer` is a context-handoff summary, not a session import.
- The stop-review gate reviews only dirty working trees and never blocks on its own failure.
