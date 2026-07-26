---
description: Hand the current Claude session's context to Kimi as a task
argument-hint: "[what Kimi should do with it]"
allowed-tools: Bash(node:*)
---

Kimi has no access to this session, so the handoff has to be written out. Compose a briefing
covering: the objective, what has been done so far, the files that matter and their current
state, decisions already made, what was tried and failed, and the specific question or task
for Kimi. Attach the relevant files with `--file` rather than pasting them.

Then run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" ask --preset rescue --file <path>... "<the briefing>$ARGUMENTS"
```

Never include secrets, credentials, tokens, or customer data in the briefing. If the briefing
would exceed a comfortable command length, write it to a file first and pass it with `--file`.
