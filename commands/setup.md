---
description: Verify the Moonshot API key and connectivity, toggle the stop-review gate
argument-hint: "[--gate on|off]"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" setup $ARGUMENTS
```

If the key is missing, tell the user to add `MOONSHOT_API_KEY` as an OS-level environment
variable (Windows: System Properties → Environment Variables) and restart Claude Code so the
new value is inherited. Never suggest a `.env` file, never ask for or echo the key value.
