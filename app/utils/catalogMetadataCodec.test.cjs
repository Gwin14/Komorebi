const test = require("node:test");
const assert = require("node:assert/strict");
const {
  writeJpegMetadata,
  writeTiffMetadata,
  readRating,
  jpegSegments,
  photoshopResources,
} = require("./catalogMetadataCodec");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const fields = {
  author: "João 山",
  copyright: "© João & amigos",
  tags: ["árvore", "céu & mar"],
  rating: 5,
};
const jpeg =
  "\xff\xd8\xff\xe1\0\x0cExif\0\0keep\xff\xda\0\x02compressed-pixels\xff\xd9";

test("JPEG inserts IPTC/XMP with UTF-8, preserves EXIF and compressed pixels, and updates rating to zero", () => {
  const result = writeJpegMetadata(jpeg, fields);
  assert.equal(readRating(result), 5);
  const parsed = jpegSegments(result);
  assert.equal(parsed.tail, jpegSegments(jpeg).tail);
  assert.ok(
    parsed.segments.some(
      (segment) => segment.raw === jpegSegments(jpeg).segments[0].raw,
    ),
  );
  const iptc = photoshopResources(
    parsed.segments.find((s) => s.marker === 237).payload,
  )[0].data;
  assert.ok(iptc.includes(unescape(encodeURIComponent(fields.author))));
  const updated = writeJpegMetadata(result, { rating: 0 });
  assert.equal(readRating(updated), 0);
  assert.ok(updated.includes("dc:creator"));
  assert.equal(
    jpegSegments(updated).segments.find((s) => s.marker === 237).raw,
    parsed.segments.find((s) => s.marker === 237).raw,
  );
  assert.equal((updated.match(/<xmp:Rating>/g) || []).length, 1);
});

test("XMP edits retain unrelated properties and replace rating using alternate namespace prefix", () => {
  const packet =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description xmlns:a="http://ns.adobe.com/xap/1.0/" a:Rating="4" a:Label="Green"/></r:RDF></x:xmpmeta>';
  const header = "http://ns.adobe.com/xap/1.0/\0";
  const payload = header + packet;
  const source =
    "\xff\xd8\xff\xe1" +
    String.fromCharCode((payload.length + 2) >> 8, (payload.length + 2) & 255) +
    payload +
    "\xff\xda\0\x02pixels";
  const result = writeJpegMetadata(source, { rating: 0 });
  assert.equal(readRating(result), 0);
  assert.ok(result.includes('a:Label="Green"'));
  assert.ok(!result.includes('a:Rating="4"'));
});

test("TIFF/DNG updates IFD0 without moving RAW bytes for both byte orders", () => {
  for (const little of [true, false]) {
    const header = little ? "II\x2a\0\x08\0\0\0" : "MM\0\x2a\0\0\0\x08";
    const original = header + "\0\0\0\0\0\0RAW-pixels";
    const updated = writeTiffMetadata(original, fields);
    assert.equal(updated.slice(8, original.length), original.slice(8));
    assert.equal(readRating(updated), 5);
    assert.equal(readRating(writeTiffMetadata(updated, { rating: 0 })), 0);
  }
});

test("rejects malformed images, invalid ratings and oversized packets", () => {
  assert.throws(() => writeJpegMetadata("bad", fields));
  assert.throws(() => writeJpegMetadata(jpeg, { rating: 6 }));
  assert.throws(() => writeJpegMetadata(jpeg, { author: "a".repeat(66000) }));
  assert.throws(() => writeTiffMetadata("II\x2a\0\xff\xff\xff\x7f", fields));
});

test("ExifTool independently reads the exact IPTC and XMP fields", (t) => {
  if (spawnSync("exiftool", ["-ver"]).error)
    return t.skip("ExifTool is not installed");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "komorebi-metadata-"),
  );
  try {
    // A minimal JPEG is sufficient for ExifTool's metadata parser.
    const file = path.join(directory, "photo.jpg");
    fs.writeFileSync(file, writeJpegMetadata(jpeg, fields), "latin1");
    const result = spawnSync(
      "exiftool",
      [
        "-j",
        "-G1",
        "-Rating",
        "-Creator",
        "-By-line",
        "-Rights",
        "-CopyrightNotice",
        "-Keywords",
        "-Subject",
        file,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout)[0];
    assert.equal(data["XMP-xmp:Rating"], 5);
    assert.equal(data["XMP-dc:Creator"], fields.author);
    assert.equal(data["IPTC:By-line"], fields.author);
    assert.equal(data["XMP-dc:Rights"], fields.copyright);
    assert.equal(data["IPTC:CopyrightNotice"], fields.copyright);
    assert.deepEqual(data["XMP-dc:Subject"], fields.tags);
    assert.deepEqual(data["IPTC:Keywords"], fields.tags);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
