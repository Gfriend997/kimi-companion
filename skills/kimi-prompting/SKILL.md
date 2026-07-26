---
name: kimi-prompting
description: Shaping task prompts for Kimi before forwarding them
---

# Prompting Kimi

Kimi answers from the prompt alone — no repo access, no shell, no memory of this session.
Everything it needs must be in the message or attached with `--file`.

Include, in this order:

1. **Objective** — what a correct answer looks like.
2. **Context** — the files (attached, not pasted), the runtime, the constraints that are not
   negotiable.
3. **What has already been tried** — for debugging asks, the failed hypotheses. Without this
   Kimi re-suggests them.
4. **The deliverable** — "unified diffs against the attached files", "a ranked list", "yes or
   no plus the evidence". Vague asks get essays.

Keep it lean:

- Attach files instead of pasting them; the runtime labels each with its path.
- Screenshots and short video clips are first-class input — attach them for UI bugs rather
  than describing what you see.
- Long logs: attach the file and name the timestamp or symptom to look for.
- Never include secrets, credentials, tokens, customer data, or proprietary content that has
  not been cleared for a third-party API.

Model choice: `kimi-k3` for long context, images, and video; `kimi-k2.7-code` for code-heavy
reasoning. Use `--effort low` for lookups and mechanical questions to save reasoning tokens.
