import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classify, filePart, buildContent } from "../scripts/lib/attach.mjs";

let dir;
const png = () => path.join(dir, "pixel.png");
const txt = () => path.join(dir, "notes.txt");

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-attach-"));
  fs.writeFileSync(
    png(),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )
  );
  fs.writeFileSync(txt(), "hello from a text file");
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("classifies by extension", () => {
  assert.equal(classify("a/b.PNG").kind, "image");
  assert.equal(classify("a/b.mp4").kind, "video");
  assert.equal(classify("a/b.ts").kind, "text");
});

test("images become base64 image_url parts", () => {
  const { part } = filePart(png());
  assert.equal(part.type, "image_url");
  assert.ok(part.image_url.url.startsWith("data:image/png;base64,"));
});

test("text files are inlined with their path as a label", () => {
  const { part } = filePart(txt());
  assert.equal(part.type, "text");
  assert.ok(part.text.includes("hello from a text file"));
  assert.ok(part.text.includes("notes.txt"));
});

test("missing files fail loudly", () => {
  assert.throws(() => filePart(path.join(dir, "nope.png")), /file not found/);
});

test("directories are rejected", () => {
  assert.throws(() => filePart(dir), /not a regular file/);
});

test("oversized files are rejected before they are read", () => {
  assert.throws(() => filePart(txt(), { maxBytes: 4 }), /file too large/);
});

test("no attachments means a plain string content", () => {
  assert.equal(buildContent("just text", []), "just text");
});

test("attachments produce a parts array with the prompt last", () => {
  const parts = buildContent("what is this?", [png()]);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].type, "image_url");
  assert.deepEqual(parts[1], { type: "text", text: "what is this?" });
});

test("total attachment size is capped", () => {
  assert.throws(() => buildContent("x", [txt(), txt()], { maxTotalBytes: 30 }), /exceed the total limit/);
});

const REJECT = /attachment rejected: .* is a binary document; convert it to markdown first \(MarkItDown\) and attach the \.md/;

test("rejects binary documents by upper-case extension", () => {
  const f = path.join(dir, "REPORT.PDF");
  fs.writeFileSync(f, "plain");
  assert.throws(() => filePart(f), REJECT);
});

test("rejects binary documents by magic bytes despite a .txt extension", () => {
  const magics = {
    pdf: Buffer.from("%PDF-1.7\nabc"),
    zip: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
    ole: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00])
  };
  for (const [name, data] of Object.entries(magics)) {
    const f = path.join(dir, `${name}.txt`);
    fs.writeFileSync(f, data);
    assert.throws(() => filePart(f), REJECT, name);
  }
});

test("rejects a NUL byte in the first 8 KB", () => {
  const f = path.join(dir, "blob.dat");
  fs.writeFileSync(f, Buffer.concat([Buffer.from("text"), Buffer.from([0]), Buffer.from("more")]));
  assert.throws(() => filePart(f), REJECT);
});

test("normal text and code files still pass", () => {
  const f = path.join(dir, "code.ts");
  fs.writeFileSync(f, "export const x = 1;\n");
  assert.equal(filePart(f).part.type, "text");
  assert.equal(filePart(txt()).part.type, "text");
});

test("decodes UTF-16 text files instead of rejecting them for NUL bytes", () => {
  const le = path.join(dir, "ps51-out.txt");
  fs.writeFileSync(le, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("hello from powershell", "utf16le")]));
  assert.match(filePart(le).part.text, /hello from powershell/);
  const be = path.join(dir, "be.txt");
  fs.writeFileSync(be, Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from("big endian", "utf16le").swap16()]));
  assert.match(filePart(be).part.text, /big endian/);
});

test("accepts RTF as text", () => {
  const f = path.join(dir, "note.rtf");
  fs.writeFileSync(f, "{\rtf1\ansi hello}");
  assert.match(filePart(f).part.text, /hello/);
});
