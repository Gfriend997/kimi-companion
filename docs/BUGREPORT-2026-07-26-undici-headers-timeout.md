# Bug Report: long Kimi calls die at 300s with an opaque "fetch failed"

**Filed:** 2026-07-26
**Component:** `scripts/lib/api.mjs`, `agents/kimi-rescue.md`
**Severity:** High. Silently breaks every long-running request and produces a misleading error that invites incorrect retries.
**Status:** Fixed 2026-07-26. See [Resolution](#resolution).

## Summary

The companion configures a 10-minute request timeout that it does not actually control. Node's built-in `fetch` (undici) independently aborts the socket at its default 300-second `headersTimeout`. Because requests are non-streaming, response headers do not arrive until the model finishes generating, so any completion taking longer than five minutes is killed by the transport layer and surfaces as `Moonshot API request failed: fetch failed`.

`--timeout-mins` is therefore a no-op for any value above 5, and `DEFAULT_TIMEOUT_MS = 10 * 60 * 1000` is unreachable.

A second, independent defect in the `kimi-rescue` agent definition caused the failure to be hidden for roughly two hours: the agent retried on its own initiative and never surfaced the original error.

## Environment

| | |
|---|---|
| Node | v24.11.0 (bundles undici) |
| OS | Windows 11 Pro 10.0.22631 |
| Model | `kimi-k3` |
| `undici` as npm package | not installed, and should stay that way |

## Impact

- Any Kimi request whose generation exceeds ~5 minutes fails, regardless of configured timeout
- The failure is indistinguishable from a genuine network error, so callers retry a deterministic failure
- Larger `--max-tokens` values and the `rescue` preset make the failure more likely, meaning the feature fails hardest exactly when the work is most substantial
- The `--timeout-mins` flag silently misleads: values above 5 have no effect

## Reproduction

Observed in the wild, then confirmed by differential comparison of two jobs run three minutes apart against the same host and key.

| | Job `2026-07-26-c83ccd0b` | Job `2026-07-26-a581e6af` |
|---|---|---|
| Files attached | 11 | 10 |
| `max_tokens` | **16000** | 8192 |
| Preset | `rescue` | none |
| Effort | none | high |
| Created | 23:53:24Z | 23:50:52Z |
| Updated | 23:58:31Z | 23:52:51Z |
| Elapsed | **306.9s** | 119.9s |
| Result | `failed` | `done` |
| Error | `Moonshot API request failed: fetch failed` | — |

Both requests used the same API key, the same host, and overlapping payloads within a three-minute window. Transient network failure is ruled out by construction: the shorter job succeeded while the longer one was in flight.

Minimal synthetic reproduction:

```bash
node scripts/kimi-companion.mjs ask --max-tokens 32000 --effort max \
  "Write an exhaustive treatise on distributed consensus. Do not stop early."
```

Expect failure at ~300s with `fetch failed`, never the configured 10-minute abort.

## Root cause

`306.9s` is 300s plus job-record and worker-spawn overhead. 300s is undici's default `headersTimeout`.

The decisive evidence is which error branch fired. `scripts/lib/api.mjs:95-98`:

```js
} catch (err) {
  if (err.name === "AbortError") throw new Error(`Moonshot API timed out after ${Math.round(timeoutMs / 60000)} min`);
  throw new Error(`Moonshot API request failed: ${err.message}`);
}
```

An expiry of the wrapper's own `AbortController` (`api.mjs:82-83`, armed with `timeoutMs` = 600000) would have produced *"Moonshot API timed out after 10 min"*. The recorded error is the second branch. The wrapper's abort never fired, because undici had already destroyed the socket at 300s.

The request is non-streaming (`api.mjs:132-136` sends no `stream` field), so the Moonshot server does not emit response headers until the completion is fully generated. Time-to-headers therefore equals total generation time, and generation time scales with the token budget. The successful job finished 8192 tokens in 120s; the failed job was allowed 16000 and crossed the 300s wall before headers were ever sent.

**Note on `max_tokens: 16000`:** this value appears nowhere in the codebase. `DEFAULT_MAX_TOKENS` is 8192 (`api.mjs:12`). The subagent passed `--max-tokens 16000` on its own, acting on guidance in `skills/kimi-api-runtime/SKILL.md:28` and `skills/kimi-result-handling/SKILL.md:25`, both of which advise raising `--max-tokens` when output is truncated. The guidance is reasonable in isolation; it is dangerous only because raising the budget silently walks the request into an undocumented 5-minute ceiling.

## Defects

### Defect 1 — undici transport timeouts are never configured (root cause)

**Location:** `scripts/lib/api.mjs:81-100`

The `AbortController` bounds total wall time but does nothing about undici's `headersTimeout` (300s default) or `bodyTimeout` (300s default). Node does not expose undici as a builtin module, so `dispatcher` cannot be set without adding the `undici` npm package.

**Recommended fix: stream the completion.** With `stream: true` the server emits headers immediately, satisfying `headersTimeout`, and each SSE chunk resets `bodyTimeout`. Generation of any length then works, and the wrapper's own `AbortController` becomes the single real timeout, as originally intended.

Sketch:

```js
// api.mjs — request() gains a streaming path
const res = await fetch(url, { method, headers, body, signal: controller.signal });
// ...
// chat() sends stream: true and accumulates deltas
let text = "", reasoning = "", usage = null, finish = null;
for await (const chunk of res.body) {
  for (const line of decoder.decode(chunk, { stream: true }).split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") continue;
    const d = JSON.parse(payload);
    const delta = d.choices?.[0]?.delta ?? {};
    if (typeof delta.content === "string") text += delta.content;
    if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
    if (d.choices?.[0]?.finish_reason) finish = d.choices[0].finish_reason;
    if (d.usage) usage = d.usage;
  }
}
```

`parseCompletion`'s existing error semantics (empty text, `finish_reason: "length"` guidance) must be preserved against the accumulated result rather than a single response body.

**Rejected alternatives:**

- *Add the `undici` package and pass a `dispatcher`.* Correct, but breaks the plugin's zero-dependency property for a problem streaming already solves.
- *Cap `max_tokens` so generation stays under 5 minutes.* A workaround, not a fix. It caps ambition rather than removing the ceiling, and the ceiling stays undocumented.

### Defect 2 — the error message discards the actual cause

**Location:** `scripts/lib/api.mjs:97`

Undici sets `err.cause.code` to `UND_ERR_HEADERS_TIMEOUT` or `UND_ERR_BODY_TIMEOUT` in exactly this scenario. The handler reports only `err.message`, which for a transport abort is the bare string `fetch failed`. All diagnostic value is thrown away at the point of failure.

Proposed:

```js
} catch (err) {
  if (err.name === "AbortError") throw new Error(`Moonshot API timed out after ${Math.round(timeoutMs / 60000)} min`);
  const code = err.cause?.code;
  if (code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
    throw new Error(
      `Moonshot API exceeded undici's 300s transport timeout (${code}). ` +
      `This is not a network error and retrying unchanged will fail identically. ` +
      `Lower --max-tokens or --effort, or enable streaming.`
    );
  }
  throw new Error(`Moonshot API request failed: ${err.message}${code ? ` (${code})` : ""}`);
}
```

This alone would have made the failure self-explaining within seconds.

### Defect 3 — the `kimi-rescue` agent hides failures and invents retries

**Location:** `agents/kimi-rescue.md:20-29`

The definition instructs:

> 2. Make exactly one `Bash` call
> 3. Return the command's stdout exactly as-is, no commentary. If the call fails, return the error output as-is.

Observed behavior violated both. After the job failed, the agent concluded *"API is reachable, so the failures were transient. Retrying the request in the background"* and submitted a second job 97 minutes later without reporting the first failure to its caller. The coordinator received no signal at all for over two hours.

Two contributing problems:

1. **No prohibition on self-directed retries.** "Exactly one Bash call" was read as a default rather than a constraint, and the reachability check was treated as licence to retry. The diagnosis was also wrong: the failure was deterministic, so the retry was guaranteed to fail the same way.
2. **The `--background` path has no defined contract.** Line 29 tells the agent to add `--background` for long-running work, but "return stdout exactly as-is" then yields only a job handle. Nothing states whether the agent should poll, or whether the caller owns polling. Undefined behavior, and the agent improvised.

Proposed rewrite of steps 2 and 3:

> 2. Make exactly one `Bash` call. Exactly one. If it fails, do not retry, do not investigate, and do not run a reachability check.
> 3. Return the command's stdout exactly as-is, no commentary. If the call fails, return the error text as-is and stop. A failed call is a complete and successful outcome for you: your caller needs the error, not a fix.
> 4. Only use `--background` when the caller explicitly asks for it. When you do, state clearly in your reply that the returned value is a job handle and that the caller must poll `status --id` and `result --id`. Never poll it yourself.

## Contributing factor: skill guidance

`skills/kimi-api-runtime/SKILL.md:28` and `skills/kimi-result-handling/SKILL.md:25` both advise raising `--max-tokens` when output is truncated, with no mention of an upper bound. That advice steers callers directly into this bug. Once Defect 1 is fixed the guidance becomes safe; until then it should carry a warning that budgets above roughly 12000 tokens risk the 300s transport ceiling.

## Test plan

`tests/api.test.mjs` currently covers `parseCompletion` error semantics. Add:

1. **Regression for Defect 2.** Mock a rejected `fetch` carrying `cause.code = "UND_ERR_HEADERS_TIMEOUT"`; assert the thrown message names the transport timeout and does not read `fetch failed`.
2. **Regression for Defect 1.** Feed a synthetic SSE stream through the streaming parser; assert content and reasoning deltas accumulate in order, `usage` and `finish_reason` are captured, and a `finish_reason: "length"` stream with empty content still raises the existing token-budget error.
3. **Long-generation smoke test**, opt-in and excluded from CI: a real request with a budget large enough to exceed five minutes, asserting success. This is the only test that would have caught the original bug.

## Workarounds until fixed

- Keep `--max-tokens` at or below the 8192 default for `kimi-k3`
- Prefer `--effort high` over `max` on large attachments
- Treat any `fetch failed` at approximately 300 seconds as this bug, not as a network problem, and do not retry unchanged
- Call the runtime directly with `--file` attachments rather than through the `kimi-rescue` agent for large-corpus work; attaching files uses Kimi's context natively and avoids the agent's file-reading step entirely

## Suggested fix order

1. **Defect 2** — one function, no behavior change, immediately makes this class of failure legible
2. **Defect 3** — prompt-only edit, no code risk, restores caller visibility
3. **Defect 1** — the real fix, shipped separately so streaming can be tested on its own

Defects 2 and 3 together would have reduced this incident from two hours to under a minute, without fixing the underlying bug at all.

## Resolution

All three defects fixed 2026-07-26.

| Defect | Fix | Location |
|---|---|---|
| 1 | `chat()` sends `stream: true` with `stream_options.include_usage`; new `collectStream()` accumulates SSE deltas into the shape `parseCompletion` already understands, so both paths share one set of error semantics. Events are reassembled across chunk boundaries. The abort timer now clears in an outer `finally`, since on the streaming path the body read *is* the generation. | `scripts/lib/api.mjs` |
| 2 | New `transportError()` names `UND_ERR_HEADERS_TIMEOUT` / `UND_ERR_BODY_TIMEOUT` explicitly and states that retrying unchanged will fail identically; unknown codes are appended rather than dropped. | `scripts/lib/api.mjs` |
| 3 | Step 2 now reads "Exactly one. If it fails, do not retry, do not investigate, and do not run a reachability check." Step 3 states a failed call is a complete outcome. `--background` only on explicit caller request, and the agent never polls it. | `agents/kimi-rescue.md` |

Also fixed in passing: `scripts/kimi-companion.mjs` dispatched with `.catch()` only, so the
synchronous subcommands (`status`, `result`, `cancel`) threw validation errors as raw stack
traces before any promise existed. Now `await` inside try/catch.

The skill guidance flagged under *Contributing factor* was left as-is: advising a higher
`--max-tokens` is safe again now that the ceiling is gone.

### Verification

- `node --test "tests/*.test.mjs"` — 41 pass, 0 fail. Seven are new: three for `transportError`, four for `collectStream` (accumulation, split chunk boundaries, preserved `length` truncation error, mid-stream error events).
- Live short request through the streaming path returns normally, with usage accounting intact.
- **Long-generation test** (test plan item 3), run against the real API with `--max-tokens 32000 --effort max --timeout-mins 9`: failed at **540 seconds** with `Moonshot API timed out after 9 min`. That is the wrapper's own `AbortController`, the branch that was previously unreachable. The request lived 240 seconds past the 300s wall that killed job `2026-07-26-c83ccd0b`. The transport ceiling is gone and `--timeout-mins` is now the only deadline.

### Known limitation

A timeout still discards everything accumulated so far. On the streaming path the partial
completion is in hand and could be returned with a truncation notice. Not built: no caller
has needed it, and the 10-minute default now leaves ample headroom.
