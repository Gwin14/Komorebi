// Binary edits preserve compressed pixels, EXIF offsets and unrelated metadata.
const utf8 = (text) => unescape(encodeURIComponent(text));
const fromUtf8 = (bytes) => decodeURIComponent(escape(bytes));
const xml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const xmpHeader = "http://ns.adobe.com/xap/1.0/\0";
const u16 = (number) => String.fromCharCode((number >> 8) & 255, number & 255);
const u32 = (number) => u16(number >>> 16) + u16(number & 65535);
const read16 = (bytes, index) =>
  bytes.charCodeAt(index) * 256 + bytes.charCodeAt(index + 1);

function buildPacket(fields, existing = "") {
  if (
    fields.rating !== undefined &&
    (!Number.isInteger(fields.rating) || fields.rating < 0 || fields.rating > 5)
  )
    throw new Error("Classificação inválida");
  let properties = "";
  if (fields.author)
    properties += `<dc:creator><rdf:Seq><rdf:li>${xml(fields.author)}</rdf:li></rdf:Seq></dc:creator>`;
  if (fields.copyright)
    properties += `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xml(fields.copyright)}</rdf:li></rdf:Alt></dc:rights>`;
  if (fields.tags?.length)
    properties += `<dc:subject><rdf:Bag>${fields.tags.map((tag) => `<rdf:li>${xml(tag)}</rdf:li>`).join("")}</rdf:Bag></dc:subject>`;
  if (fields.rating !== undefined)
    properties += `<xmp:Rating>${fields.rating}</xmp:Rating>`;
  const description = `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">${properties}</rdf:Description>`;
  if (!existing)
    return `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${description}</rdf:RDF></x:xmpmeta>`;
  // Remove only the fields being updated, including properties using alternate prefixes.
  for (const [namespace, name, enabled] of [
    ["http://purl.org/dc/elements/1.1/", "creator", Boolean(fields.author)],
    ["http://purl.org/dc/elements/1.1/", "rights", Boolean(fields.copyright)],
    [
      "http://purl.org/dc/elements/1.1/",
      "subject",
      Boolean(fields.tags?.length),
    ],
    ["http://ns.adobe.com/xap/1.0/", "Rating", fields.rating !== undefined],
  ]) {
    if (!enabled) continue;
    const prefixes = [
      ...existing.matchAll(/xmlns:([\w-]+)\s*=\s*["']([^"']+)["']/g),
    ]
      .filter((match) => match[2] === namespace)
      .map((match) => match[1]);
    for (const prefix of prefixes) {
      existing = existing
        .replace(
          new RegExp(
            `<${prefix}:${name}\\b[^>]*>[\\s\\S]*?</${prefix}:${name}\\s*>`,
            "g",
          ),
          "",
        )
        .replace(
          new RegExp(`\\s${prefix}:${name}\\s*=\\s*(["'])[\\s\\S]*?\\1`, "g"),
          "",
        );
    }
  }
  const rdfPrefix = [
    ...existing.matchAll(/xmlns:([\w-]+)\s*=\s*["']([^"']+)["']/g),
  ].find(
    (match) => match[2] === "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  )?.[1];
  const closing = rdfPrefix && `</${rdfPrefix}:RDF>`;
  if (!closing || !existing.includes(closing))
    throw new Error("Pacote XMP inválido");
  return existing.replace(
    closing,
    description.replace(
      "<rdf:Description ",
      '<rdf:Description xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" ',
    ) + closing,
  );
}

function updateIptc(existing, fields) {
  const replaced = new Set([
    ...(fields.author ? [80] : []),
    ...(fields.copyright ? [116] : []),
    ...(fields.tags?.length ? [25] : []),
  ]);
  let result = "";
  for (let offset = 0; offset < existing.length;) {
    if (existing.charCodeAt(offset) !== 28 || offset + 5 > existing.length)
      throw new Error("IPTC inválido");
    const length = read16(existing, offset + 3);
    if (length & 0x8000 || offset + 5 + length > existing.length)
      throw new Error("IPTC estendido não suportado");
    const record = existing.charCodeAt(offset + 1),
      dataset = existing.charCodeAt(offset + 2);
    if (
      !(record === 2 && replaced.has(dataset)) &&
      !(record === 1 && dataset === 90)
    )
      result += existing.slice(offset, offset + 5 + length);
    offset += 5 + length;
  }
  const dataset = (record, id, value) => {
    const bytes = utf8(value);
    if (bytes.length > 32767) throw new Error("Campo IPTC muito longo");
    return String.fromCharCode(28, record, id) + u16(bytes.length) + bytes;
  };
  result += dataset(1, 90, "\x1b%G"); // IPTC CodedCharacterSet: UTF-8
  if (fields.author) result += dataset(2, 80, fields.author);
  if (fields.copyright) result += dataset(2, 116, fields.copyright);
  for (const tag of fields.tags || []) result += dataset(2, 25, tag);
  return result;
}

function jpegSegments(bytes) {
  if (bytes.slice(0, 2) !== "\xff\xd8") throw new Error("Imagem JPEG inválida");
  const segments = [];
  let offset = 2;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes.charCodeAt(offset++) !== 255) throw new Error("JPEG inválido");
    while (bytes.charCodeAt(offset) === 255) offset++;
    const marker = bytes.charCodeAt(offset++);
    if (marker === 218 || marker === 217)
      return { segments, tail: bytes.slice(start) };
    if (marker === 1 || (marker >= 208 && marker <= 215)) {
      segments.push({ marker, raw: bytes.slice(start, offset), payload: "" });
      continue;
    }
    const length = read16(bytes, offset);
    if (length < 2 || offset + length > bytes.length)
      throw new Error("Segmento JPEG inválido");
    segments.push({
      marker,
      raw: bytes.slice(start, offset + length),
      payload: bytes.slice(offset + 2, offset + length),
    });
    offset += length;
  }
  throw new Error("JPEG incompleto");
}

function photoshopResources(payload) {
  let offset = 14;
  const resources = [];
  while (offset < payload.length) {
    const start = offset;
    if (payload.slice(offset, offset + 4) !== "8BIM")
      throw new Error("Recurso Photoshop inválido");
    const id = read16(payload, offset + 4);
    offset += 6;
    const nameSize = payload.charCodeAt(offset) + 1;
    offset += nameSize + (nameSize % 2);
    const size = read16(payload, offset) * 65536 + read16(payload, offset + 2);
    offset += 4;
    if (offset + size > payload.length)
      throw new Error("Recurso IPTC incompleto");
    const data = payload.slice(offset, offset + size);
    offset += size + (size % 2);
    resources.push({ id, data, raw: payload.slice(start, offset) });
  }
  return resources;
}

function writeJpegMetadata(bytes, fields) {
  const { segments, tail } = jpegSegments(bytes);
  let existingXmp = "",
    existingIptc = "",
    resources = "";
  const preserved = segments.filter((segment) => {
    if (segment.marker === 225 && segment.payload.startsWith(xmpHeader)) {
      existingXmp = fromUtf8(segment.payload.slice(xmpHeader.length));
      return false;
    }
    if (
      segment.marker === 237 &&
      segment.payload.startsWith("Photoshop 3.0\0")
    ) {
      for (const resource of photoshopResources(segment.payload)) {
        if (resource.id === 1028) existingIptc += resource.data;
        else if (resource.id !== 1061) resources += resource.raw; // Remove stale IPTC digest.
      }
      return false;
    }
    return true;
  });
  const segment = (marker, payload) => {
    if (payload.length > 65533)
      throw new Error("Metadados excedem o limite JPEG");
    return String.fromCharCode(255, marker) + u16(payload.length + 2) + payload;
  };
  let added = segment(225, xmpHeader + utf8(buildPacket(fields, existingXmp)));
  if (fields.author || fields.copyright || fields.tags?.length) {
    const iptc = updateIptc(existingIptc, fields);
    added += segment(
      237,
      "Photoshop 3.0\0" +
        resources +
        "8BIM" +
        u16(1028) +
        "\0\0" +
        u32(iptc.length) +
        iptc +
        (iptc.length % 2 ? "\0" : ""),
    );
  } else {
    // A rating update must preserve the existing IPTC packet byte for byte.
    added += segments
      .filter(
        (s) => s.marker === 237 && s.payload.startsWith("Photoshop 3.0\0"),
      )
      .map((s) => s.raw)
      .join("");
  }
  return "\xff\xd8" + preserved.map((s) => s.raw).join("") + added + tail;
}

// TIFF/DNG metadata is added via a new IFD0. Original image/RAW data and all offsets remain untouched.
function writeTiffMetadata(bytes, fields) {
  const little = bytes.slice(0, 2) === "II";
  if (!little && bytes.slice(0, 2) !== "MM") throw new Error("TIFF inválido");
  const read = (offset, size) => {
    let value = 0;
    for (let i = 0; i < size; i++)
      value +=
        bytes.charCodeAt(offset + i) * 2 ** (8 * (little ? i : size - i - 1));
    return value;
  };
  const write = (value, size) => {
    let result = "";
    for (let i = 0; i < size; i++)
      result += String.fromCharCode(
        Math.floor(value / 2 ** (8 * (little ? i : size - i - 1))) & 255,
      );
    return result;
  };
  if (read(2, 2) !== 42) throw new Error("BigTIFF não suportado");
  const offset = read(4, 4);
  if (!Number.isFinite(offset) || offset < 8 || offset + 2 > bytes.length)
    throw new Error("IFD inválido");
  const count = read(offset, 2);
  if (offset < 8 || offset + 2 + count * 12 + 4 > bytes.length)
    throw new Error("IFD inválido");
  const entries = [];
  let oldXmp = "",
    oldIptc = "";
  for (let i = 0; i < count; i++) {
    const start = offset + 2 + i * 12,
      tag = read(start, 2),
      type = read(start + 2, 2),
      length = read(start + 4, 4);
    if (tag === 700 || tag === 33723) {
      const size = length * (type === 4 ? 4 : 1),
        dataOffset = size <= 4 ? start + 8 : read(start + 8, 4);
      if (dataOffset + size > bytes.length)
        throw new Error("Metadados TIFF inválidos");
      if (tag === 700)
        oldXmp = fromUtf8(
          bytes.slice(dataOffset, dataOffset + size).replace(/\0+$/, ""),
        );
      else
        oldIptc = bytes
          .slice(dataOffset, dataOffset + size)
          .replace(/\0+$/, "");
      if (
        tag === 33723 &&
        !(fields.author || fields.copyright || fields.tags?.length)
      )
        entries.push({ tag, raw: bytes.slice(start, start + 12) });
    } else entries.push({ tag, raw: bytes.slice(start, start + 12) });
  }
  let result = bytes + (bytes.length % 2 ? "\0" : "");
  const append = (tag, data) => {
    const position = result.length;
    result += data + (data.length % 2 ? "\0" : "");
    entries.push({
      tag,
      raw:
        write(tag, 2) +
        write(1, 2) +
        write(data.length, 4) +
        (data.length <= 4 ? data.padEnd(4, "\0") : write(position, 4)),
    });
  };
  append(700, utf8(buildPacket(fields, oldXmp)));
  if (fields.author || fields.copyright || fields.tags?.length)
    append(33723, updateIptc(oldIptc, fields));
  const newOffset = result.length;
  result +=
    write(entries.length, 2) +
    entries
      .sort((a, b) => a.tag - b.tag)
      .map((e) => e.raw)
      .join("") +
    bytes.slice(offset + 2 + count * 12, offset + 6 + count * 12);
  return result.slice(0, 4) + write(newOffset, 4) + result.slice(8);
}

function readRating(bytes) {
  let xmp = "";
  if (bytes.startsWith("\xff\xd8")) {
    const segment = jpegSegments(bytes).segments.find(
      (s) => s.marker === 225 && s.payload.startsWith(xmpHeader),
    );
    xmp = segment ? segment.payload.slice(xmpHeader.length) : "";
  } else if (bytes.startsWith("II") || bytes.startsWith("MM")) {
    const little = bytes.startsWith("II");
    const read = (offset, size) => {
      let value = 0;
      for (let i = 0; i < size; i++)
        value +=
          bytes.charCodeAt(offset + i) * 2 ** (8 * (little ? i : size - i - 1));
      return value;
    };
    const offset = read(4, 4);
    if (offset < 8 || offset + 2 > bytes.length) return null;
    const count = read(offset, 2);
    if (offset + 2 + count * 12 + 4 > bytes.length) return null;
    for (let i = 0; i < count; i++) {
      const start = offset + 2 + i * 12;
      if (read(start, 2) !== 700) continue;
      const length = read(start + 4, 4),
        position = length <= 4 ? start + 8 : read(start + 8, 4);
      if (position + length <= bytes.length)
        xmp = bytes.slice(position, position + length);
    }
  }
  const packet =
    xmp.match(/<(?:[\w-]+):Rating\b[^>]*>([0-5])<\//)?.[1] ??
    xmp.match(/(?:[\w-]+):Rating\s*=\s*["']([0-5])["']/)?.[1];
  return packet === undefined ? null : Number(packet);
}
module.exports = {
  buildPacket,
  writeJpegMetadata,
  writeTiffMetadata,
  readRating,
  jpegSegments,
  photoshopResources,
};
