KIMI COMPANION ROUTING POLICY

Route matching work to the Kimi Companion plugin as follows.

Auto-route, no confirmation needed:
- Understanding an image or screenshot the user points at → run /kimi-companion:ask with --file. Kimi reads images natively.
- Video, audio, or PDF understanding → route first to /gemini-companion:ask --file when the content is public-safe. Video content must not go to Google's free tier otherwise; in that case use /kimi-companion:ask --file for video clips or UI recordings. Kimi rejects PDFs; convert them to markdown first.
- Analysis that needs a very large amount of text in one pass (long logs, whole-file sweeps, many files at once) → /kimi-companion:ask with --file; kimi-k3 has a 1M token context.

Confirm with one line first, then proceed:
- Delegating a substantial implementation or investigation → kimi-rescue agent. Kimi returns a plan and diffs; you apply them.
- Adversarial review or background jobs — slower and quota-heavy.

Never route to Kimi:
- Image, video, or movie GENERATION. Moonshot has no such endpoint. Use grok-companion imagine for raster images (Gemini image --hq as fallback) and grok-companion video for video.

When both companions are loaded:
- Routine second opinion on a diff belongs to Gemini. Only run /kimi-companion:review when the user asks for Kimi by name, or when Gemini already reviewed and a third read is wanted. Do not run both for one diff.
- Anything involving reading an image, a screenshot, or a very large body of text is Kimi's, not Gemini's. Video, audio, and PDF go to Gemini first when public-safe (see above).

Always: never include secrets, credentials, or API keys in prompts sent to Kimi.
