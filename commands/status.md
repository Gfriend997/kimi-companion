---
description: List Kimi background jobs or inspect one
argument-hint: "[--id <job-id>]"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" status $ARGUMENTS
```

Without `--id` this lists the 20 most recent jobs. With `--id` it prints that job's full
record. Fetch a finished job's output with `/kimi-companion:result --id <job-id>`.
