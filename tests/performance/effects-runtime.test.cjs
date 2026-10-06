const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { loadModule } = require("../helpers/loadModule.cjs");
const { generateRuntimeHTML } = loadModule("app/utils/lutProcessingHtml.js");

function runtime(failure = null) {
  const messages = [];
  let image,
    reader,
    reads = 0,
    encoded = null;
  const pixels = new Uint8ClampedArray([64, 128, 192, 255]);
  const ctx = {
    drawImage() {
      if (failure === "draw") throw new Error("draw failure");
    },
    getImageData() {
      reads++;
      return { data: pixels };
    },
    putImageData() {},
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob(callback, type, quality) {
      if (failure === "encode") throw new Error("encode failure");
      encoded = { width: canvas.width, height: canvas.height, type, quality };
      callback(failure === "blob" ? null : {});
    },
  };
  class Image {
    constructor() {
      image = this;
      this.width = 4000;
      this.height = 3000;
    }
    set src(value) {
      this.source = value;
    }
  }
  class FileReader {
    constructor() {
      reader = this;
    }
    readAsDataURL() {
      if (failure === "read") {
        this.onerror();
        return;
      }
      if (failure === "abort") {
        this.onabort();
        return;
      }
      this.result = "data:image/jpeg;base64,encoded";
      this.onload();
    }
  }
  const sandbox = {
    document: { getElementById: () => canvas },
    Image,
    FileReader,
    window: {
      ReactNativeWebView: {
        postMessage: (text) => messages.push(JSON.parse(text)),
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    generateRuntimeHTML().match(/<script>([\s\S]*)<\/script>/)[1],
    sandbox,
  );
  return {
    canvas,
    pixels,
    messages,
    get reads() {
      return reads;
    },
    get encoded() {
      return encoded;
    },
    run(cube = null) {
      sandbox.processImage({ requestId: 9, base64: "input", cube });
      if (failure === "image") image.onerror();
      else image.onload();
    },
    get image() {
      return image;
    },
    get reader() {
      return reader;
    },
  };
}

test("no LUT avoids unused full-size pixel copy; JPEG dimensions and quality remain unchanged", () => {
  const r = runtime();
  r.run();
  assert.equal(r.reads, 0);
  assert.deepEqual(r.encoded, {
    width: 3000,
    height: 2250,
    type: "image/jpeg",
    quality: 0.86,
  });
  assert.deepEqual(r.messages, [
    { type: "success", data: "encoded", requestId: 9 },
  ]);
  assert.equal(r.canvas.width * r.canvas.height, 1);
  assert.equal(r.image.source, "");
  assert.equal(r.image.onload, null);
});

test("identity LUT preserves sample pixels while releasing the canvas after encoding", () => {
  const r = runtime();
  r.run({
    size: 2,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    lut: Array.from({ length: 8 }, (_, i) => ({
      r: i & 1,
      g: (i >> 1) & 1,
      b: (i >> 2) & 1,
    })),
  });
  assert.equal(r.reads, 1);
  assert.deepEqual([...r.pixels], [64, 128, 192, 255]);
  assert.equal(r.messages[0].type, "success");
  assert.equal(r.canvas.width, 1);
});

for (const failure of ["image", "draw", "encode", "blob", "read", "abort"]) {
  test(`${failure} failure replies once and releases image/canvas resources`, () => {
    const r = runtime(failure);
    r.run();
    assert.equal(r.messages.length, 1);
    assert.equal(r.messages[0].type, "error");
    assert.equal(r.messages[0].requestId, 9);
    assert.equal(r.canvas.width * r.canvas.height, 1);
    assert.equal(r.image.onload, null);
  });
}
