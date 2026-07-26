---
description: Hostile second-pass Kimi review hunting for breakage in the current diff
argument-hint: "[--base <ref>] [--model <m>] [--effort low|high|max]"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" review --adversarial $ARGUMENTS
```

This pass optimizes for finding breakage, so expect false positives. Relay it verbatim, then
separate the findings you can confirm in the code from the ones you cannot.
