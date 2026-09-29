function buildLutAtlas(cube) {
  if (!cube?.size || cube.size < 2 || cube.lut?.length !== cube.size ** 3) return null;
  const size = cube.size;
  const width = size * (size + 2);
  const pixels = new Uint8Array(width * size * 4);
  for (let index = 0; index < cube.lut.length; index += 1) {
    const color = cube.lut[index];
    if (![color.r, color.g, color.b].every(Number.isFinite)) return null;
    const red = index % size;
    const green = Math.floor(index / size) % size;
    const blue = Math.floor(index / (size * size));
    const slice = blue * (size + 2);
    const positions = [slice + red + 1];
    if (red === 0) positions.push(slice);
    if (red === size - 1) positions.push(slice + size + 1);
    for (const x of positions) {
      const offset = (green * width + x) * 4;
      pixels[offset] = Math.round(Math.min(1, Math.max(0, color.r)) * 255);
      pixels[offset + 1] = Math.round(Math.min(1, Math.max(0, color.g)) * 255);
      pixels[offset + 2] = Math.round(Math.min(1, Math.max(0, color.b)) * 255);
      pixels[offset + 3] = 255;
    }
  }
  return {
    pixels,
    width,
    height: size,
    size,
    domainMin: cube.domainMin ?? [0, 0, 0],
    domainScale: (cube.domainMax ?? [1, 1, 1]).map((max, channel) =>
      1 / Math.max(0.0001, max - (cube.domainMin?.[channel] ?? 0))),
  };
}

module.exports = { buildLutAtlas };
