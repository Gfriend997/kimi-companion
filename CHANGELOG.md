# Changelog

Entries start at 0.1.3. Earlier history is in `git log`.

## 0.1.5

### Changed
- The session routing policy no longer sends routine diff reviews to Gemini. Routine diffs go to the host's own reviewer. Gemini reviews only large or risky diffs, and Kimi reviews only on request or as a third read on a risky diff.

### Added
- `.specify/` Spec Kit setup from the pinned fork `Gfriend997/spec-kit@3238fa9`.

## 0.1.4

### Fixed
- `review --base <ref>` with an empty diff now reports "no diff to review against <ref>". Before, it silently reviewed the last commit.
- The stop-review gate now runs only when tracked files have uncommitted changes. Before, a tree with only untracked files made it review the last commit and block the stop.
- The 200 KB review diff cap now counts UTF-8 bytes. Before, it cut at 200K JavaScript characters, so multi-byte text could pass about twice the cap.
- HTTP redirects are now refused (`redirect: "error"`), so a request cannot leave the allowlisted Moonshot host.
- `config.json` writes now pass through the scrubber, as AGENTS.md requires.

### Added
- `review` and `adversarial-review` accept `--timeout-mins`, `--show-reasoning` and `--background`.
- A stderr warning when `--effort` will be ignored for the chosen model.

### Docs
- The Windows key setup no longer types the key inline, which would leave it in PowerShell history.
- Flags are documented per command, and the models table has an `--effort` column plus the `kimi-k3.1-pro` models.
- The routing summary, the adversarial-review mapping, review's diff rules, UTF-16 attachments, outbound-data scrubbing, timeouts and troubleshooting rows now match the code.
- `commands/ask.md` routes image generation to grok-companion.
- The resolved undici bug report moved to `docs/`.

## 0.1.3

- Image and video generation requests route to grok-companion, with Gemini as fallback (`c558ba0`).
