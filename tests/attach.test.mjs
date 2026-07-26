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
