// Masks secrets before anything is written to logs or job state files.
// MOONSHOT_API_KEY must never land on disk; this is the guard at the write boundary.

// Moonshot keys look like sk-<48 chars>. Keep the pattern loose enough to catch
// OpenAI-style keys too, since this plugin speaks an OpenAI-compatible API.
const SK_KEY = /\bsk-[A-Za-z0-9_-]{16,}/g;
// generic "key=<long token>" style assignments (key/token/secret/bearer/password)
const LABELED_TOKEN = /\b(key|token|secret|bearer|password|authorization)\b([=:\s"']{1,5})([A-Za-z0-9._~+/-]{20,})/gi;

export function scrub(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  let out = text.replace(SK_KEY, "[REDACTED]");
  out = out.replace(LABELED_TOKEN, (_m, label, sep) => `${label}${sep}[REDACTED]`);
  const envKey = process.env.MOONSHOT_API_KEY;
  if (envKey && envKey.length >= 8) out = out.split(envKey).join("[REDACTED]");
  return out;
}

export function scrubDeep(value) {
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v);
    return out;
  }
  return value;
}
