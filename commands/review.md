---
description: Ask Kimi to review the current diff (or a given base ref)
argument-hint: "[--base <ref>] [--model <m>] [--effort low|high|max]"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" review $ARGUMENTS
```

Reviews the working diff, falling back to the last commit when the tree is clean. Relay the
findings verbatim, then say which ones you agree with and why — do not silently act on them.
