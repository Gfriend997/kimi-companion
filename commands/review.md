---
description: Ask Kimi to review the current diff (or a given base ref)
argument-hint: "[--base <ref>] [--model <m>] [--effort low|high|max] [--max-tokens <n>] [--timeout-mins <n>] [--show-reasoning] [--background]"
allowed-tools: Bash(node:*)
---

Run exactly one Bash command and show its stdout verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" review $ARGUMENTS
```

Reviews `git diff HEAD` (tracked files only; untracked files must be `git add`ed first),
falling back to the last commit when that diff is empty. With `--base <ref>` there is no
fallback: an empty diff against the ref is reported as nothing to review. Diffs over 200 KB
are truncated. Relay the
findings verbatim, then say which ones you agree with and why — do not silently act on them.
