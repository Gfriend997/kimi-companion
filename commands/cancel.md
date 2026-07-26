---
description: Cancel a running Kimi background job
argument-hint: "--id <job-id>"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" cancel $ARGUMENTS
```

Jobs that already finished are reported as-is. Find the id with `/kimi-companion:status`.
