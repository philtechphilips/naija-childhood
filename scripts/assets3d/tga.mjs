// Minimal TGA decoder (truecolor, raw or RLE, 24/32-bit) -> RGBA Uint8Array.
export function decodeTga(buf) {
  const idLength = buf[0];
  const colorMapType = buf[1];
  const imageType = buf[2];
  if (colorMapType !== 0 || (imageType !== 2 && imageType !== 10)) {
    throw new Error(`Unsupported TGA type ${imageType}`);
  }
  const colorMapLength = buf.readUInt16LE(5);
  const colorMapDepth = buf[7];
  const width = buf.readUInt16LE(12);
  const height = buf.readUInt16LE(14);
  const bpp = buf[16];
  const descriptor = buf[17];
  const bytes = bpp / 8;
  if (bytes !== 3 && bytes !== 4) throw new Error(`Unsupported TGA depth ${bpp}`);
  let p = 18 + idLength + colorMapLength * Math.ceil(colorMapDepth / 8);
  const px = new Uint8Array(width * height * 4);
  const n = width * height;
  let i = 0;
  const put = (b, g, r, a) => {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
    i++;
  };
  if (imageType === 2) {
    while (i < n) {
      put(buf[p], buf[p + 1], buf[p + 2], bytes === 4 ? buf[p + 3] : 255);
      p += bytes;
    }
  } else {
    while (i < n) {
      const header = buf[p++];
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        const b = buf[p], g = buf[p + 1], r = buf[p + 2], a = bytes === 4 ? buf[p + 3] : 255;
        p += bytes;
        for (let k = 0; k < count && i < n; k++) put(b, g, r, a);
      } else {
        for (let k = 0; k < count && i < n; k++) {
          put(buf[p], buf[p + 1], buf[p + 2], bytes === 4 ? buf[p + 3] : 255);
          p += bytes;
        }
      }
    }
  }
  // TGA origin is bottom-left unless bit 5 is set: flip to top-left.
  if ((descriptor & 0x20) === 0) {
    const row = width * 4;
    const tmp = new Uint8Array(row);
    for (let y = 0; y < height / 2; y++) {
      const a = y * row;
      const b = (height - 1 - y) * row;
      tmp.set(px.subarray(a, a + row));
      px.copyWithin(a, b, b + row);
      px.set(tmp, b);
    }
  }
  return { width, height, data: px };
}
