// Turns local file paths into chat message content parts.
// Kimi K3 / K2.7 / K2.6 accept text, image_url, and video_url parts. Media is
// inlined as base64 data URLs; the Files API path is deferred until a real need.

import fs from "node:fs";
import path from "node:path";

export const IMAGE_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp"
};

export const VIDEO_MIME = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo"
};

export const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_BYTES = 40 * 1024 * 1024;
// Text files are inlined into the prompt; cap them so one stray binary cannot
// blow up the request even inside a 1M-token context window.
export const DEFAULT_MAX_TEXT_BYTES = 4 * 1024 * 1024;

export function classify(file) {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_MIME[ext]) return { kind: "image", mime: IMAGE_MIME[ext] };
  if (VIDEO_MIME[ext]) return { kind: "video", mime: VIDEO_MIME[ext] };
  return { kind: "text", mime: "text/plain" };
}

const BINARY_DOC_EXT = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".zip", ".7z", ".rar", ".epub"
]);
const BINARY_MAGIC = [
  Buffer.from("%PDF-"),
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
];

// Binary documents decode to garbage as UTF-8 and the model answers confidently wrong.
export function isBinaryDoc(file, data) {
  if (BINARY_DOC_EXT.has(path.extname(file).toLowerCase())) return true;
  if (!data) return false;
  if (BINARY_MAGIC.some((m) => data.subarray(0, m.length).equals(m))) return true;
  return !hasUtf16Bom(data) && data.subarray(0, 8192).includes(0);
}

const hasUtf16Bom = (b) => b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff));

// Windows PowerShell 5.1 writes UTF-16 by default; decode it instead of rejecting it for its NUL bytes.
export function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = Buffer.from(buf.subarray(2, buf.length - (buf.length % 2)));
    return body.swap16().toString("utf16le");
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  return buf.toString("utf8");
}

function rejectBinary(file) {
  return new Error(
    `attachment rejected: ${path.basename(file)} is a binary document; convert it to markdown first (MarkItDown) and attach the .md`
  );
}

function statFile(file, maxBytes) {
  const resolved = path.resolve(file);
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    throw new Error(`file not found: ${file}`);
  }
  if (!st.isFile()) throw new Error(`not a regular file: ${file}`);
  if (st.size === 0) throw new Error(`file is empty: ${file}`);
  if (st.size > maxBytes) {
    throw new Error(
      `file too large: ${file} is ${(st.size / 1048576).toFixed(1)} MB, limit ${(maxBytes / 1048576).toFixed(0)} MB (raise --max-file-mb, or downscale/trim the media)`
    );
  }
  return { resolved, size: st.size };
}

export function filePart(file, { maxBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  const { kind, mime } = classify(file);
  if (kind === "text" && isBinaryDoc(file)) throw rejectBinary(file);
  const limit = kind === "text" ? Math.min(maxBytes, DEFAULT_MAX_TEXT_BYTES) : maxBytes;
  const { resolved, size } = statFile(file, limit);
  const data = fs.readFileSync(resolved);

  if (kind === "text") {
    if (isBinaryDoc(file, data)) throw rejectBinary(file);
    return {
      size,
      part: { type: "text", text: `--- file: ${file} ---\n${decodeText(data)}\n--- end of ${file} ---` }
    };
  }
  const url = `data:${mime};base64,${data.toString("base64")}`;
  return kind === "image"
    ? { size, part: { type: "image_url", image_url: { url } } }
    : { size, part: { type: "video_url", video_url: { url } } };
}

// Returns a plain string when there are no attachments (the API's simple form)
// and a parts array otherwise.
export function buildContent(text, files = [], opts = {}) {
  if (!files.length) return text;
  const maxTotal = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const parts = [];
  let total = 0;
  for (const file of files) {
    const { part, size } = filePart(file, opts);
    total += size;
    if (total > maxTotal) {
      throw new Error(
        `attachments exceed the total limit of ${(maxTotal / 1048576).toFixed(0)} MB — send fewer files per call`
      );
    }
    parts.push(part);
  }
  if (text) parts.push({ type: "text", text });
  return parts;
}
