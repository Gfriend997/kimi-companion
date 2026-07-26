---
description: Delegate a task, investigation, or fix to Kimi
argument-hint: "[--file <path>]... [--background] [--model <m>] [what Kimi should do]"
allowed-tools: Bash(node:*), Agent
---

Invoke the `kimi-companion:kimi-rescue` subagent via the `Agent` tool
(`subagent_type: "kimi-companion:kimi-rescue"`), forwarding the raw user request as the prompt.
The final user-visible response must be Kimi's output verbatim — no paraphrase, no commentary.

Raw user request:
$ARGUMENTS

Rules:

- Kimi runs over the API, not as an agent with tools: it cannot read the repo or edit files.
  Pass the files it needs with `--file`, and expect a plan plus unified diffs back.
- Applying those diffs is your job, after the user has seen them.
- `--background` for long jobs; default is foreground.
- `--model` passes through only when the user names one.
- If the key is missing the script says so — tell the user to run `/kimi-companion:setup`.
- If no request text is given, ask what Kimi should do.
