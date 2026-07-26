---
name: kimi-api-runtime
description: Contract for invoking the kimi-companion runtime script from Claude Code
---

# Kimi companion runtime

Single entry point: `node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" <subcommand> [flags]`

| Subcommand | Purpose | Key flags |
|---|---|---|
| `setup` | Key presence, API reachability, model list, gate toggle | `--gate on\|off` |
| `ask "<prompt>"` | One completion, optionally over attached files | `--file <path>` (repeatable) `--model <m>` `--effort low\|high\|max` `--preset rescue` `--max-tokens <n>` `--max-file-mb <n>` `--timeout-mins <n>` `--show-reasoning` `--background` |
| `review` | Review the current git diff | `--adversarial --base <ref> --model <m> --effort <e>` |
| `status` | List jobs / one job | `--id <job-id>` |
| `result` | Print a finished job's output | `--id <job-id>` |
| `cancel` | Kill a background job | `--id <job-id>` |

Rules:

- Prompt text is one quoted positional argument. Attachments go through `--file`, never
  pasted into the prompt — that is what keeps large media and long files out of argv.
- Kimi has **no image or video generation**. It reads images and video; it does not create
  them. Route generation requests elsewhere.
- Default model `kimi-k3` (1M context, vision + video input). `kimi-k2.7-code` for code work
  (256K). Do not pass `temperature` or `top_p` — they are fixed server-side.
- The models spend completion budget on reasoning. An empty answer with a `length` finish
  reason means raise `--max-tokens` or drop `--effort` to `low`.
- Never pass, echo, or log `MOONSHOT_API_KEY`. The script reads it from the environment.
- Exit code 1 means failure; stderr carries the reason. Relay it, do not retry blindly.
