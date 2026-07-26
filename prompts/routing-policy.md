KIMI COMPANION ROUTING POLICY

Route matching work to the Kimi Companion plugin as follows.

Auto-route, no confirmation needed:
- Understanding an image, screenshot, video clip, or UI recording the user points at → run /kimi-companion:ask with --file. Kimi reads images and video natively.
- Analysis that needs a very large amount of text in one pass (long logs, whole-file sweeps, many files at once) → /kimi-companion:ask with --file; kimi-k3 has a 1M token context.

Confirm with one line first, then proceed:
- Delegating a substantial implementation or investigation → kimi-rescue agent. Kimi returns a plan and diffs; you apply them.
- Adversarial review or background jobs — slower and quota-heavy.

Never route to Kimi:
- Image, video, or movie GENERATION. Moonshot has no such endpoint. Use the Gemini companion for raster image generation.

Always: never include secrets, credentials, or API keys in prompts sent to Kimi.
