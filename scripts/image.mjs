// Shared image normalisation for the Sitely build pipeline.
// Accepts anything a website realistically serves as an icon (PNG, JPEG, WebP,
// GIF, SVG, ICO/BMP) and returns a real PNG buffer. Failures throw with the
// actual reason — never a guessed diagnosis, never a silent default icon.
import { Buffer } from "node:buffer";
import sharp from "sharp";

export function sniffFormat(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "gif";
  if (buf.subarray(0, 2).toString("latin1") === "BM") return "bmp";
  if (buf.length >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) return "ico";
  const head = buf.subarray(0, 512).toString("utf8").trim().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return "svg";
  return "unknown";
}

/** Decodes the largest frame of an ICO/CUR file into a PNG buffer. */
async function icoToPng(buf) {
  const count = buf.readUInt16LE(4);
  if (!count) throw new Error("ICO file declares zero images.");
  let best = null;
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    if (off + 16 > buf.length) break;
    const width = buf[off] === 0 ? 256 : buf[off];
    const height = buf[off + 1] === 0 ? 256 : buf[off + 1];
    const size = buf.readUInt32LE(off + 8);
    const dataOff = buf.readUInt32LE(off + 12);
    if (dataOff + size > buf.length) continue;
    if (!best || width * height > best.width * best.height) best = { width, height, size, dataOff };
  }
  if (!best) throw new Error("ICO file has no readable image frame.");
  const frame = buf.subarray(best.dataOff, best.dataOff + best.size);

  if (sniffFormat(frame) === "png") return sharp(frame).png().toBuffer();

  // Otherwise it is a headerless BMP (DIB). Decode 24/32bpp bottom-up rows.
  const dibSize = frame.readUInt32LE(0);
  const width = frame.readInt32LE(4);
  const dibHeight = frame.readInt32LE(8);
  const bpp = frame.readUInt16LE(14);
  const height = Math.abs(dibHeight) / 2 || best.height; // ICO DIBs stack an AND mask
  if (bpp !== 24 && bpp !== 32) {
    throw new Error(`ICO frame uses ${bpp}-bit colour, which is not supported. Upload a PNG icon instead.`);
  }
  const bytesPerPx = bpp / 8;
  const rowSize = Math.ceil((width * bytesPerPx) / 4) * 4;
  const pixels = frame.subarray(dibSize);
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * bytesPerPx;
      const d = (y * width + x) * 4;
      if (s + bytesPerPx > pixels.length) continue;
      out[d] = pixels[s + 2];
      out[d + 1] = pixels[s + 1];
      out[d + 2] = pixels[s];
      out[d + 3] = bpp === 32 ? pixels[s + 3] : 255;
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * Normalises a downloaded image to PNG and enforces a usable minimum size.
 * @param {string} label human label used in error messages ("Icon"/"Splash")
 * @param {Buffer} buf   raw downloaded bytes
 * @param {number} minSide smallest acceptable edge in px
 */
export async function normalizeToPng(label, buf, minSide = 48) {
  const format = sniffFormat(buf);
  if (format === "unknown") {
    const preview = buf.subarray(0, 60).toString("utf8").replace(/[^\x20-\x7e]/g, ".");
    throw new Error(
      `${label} is not an image we can decode (first bytes: "${preview}"). ` +
        `Supported: PNG, JPEG, WebP, GIF, SVG, ICO.`,
    );
  }

  let png;
  try {
    if (format === "ico") {
      png = await icoToPng(buf);
    } else if (format === "svg") {
      png = await sharp(buf, { density: 512 }).resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    } else {
      png = await sharp(buf).png().toBuffer();
    }
  } catch (err) {
    throw new Error(`${label} (${format}) could not be decoded: ${err.message}`);
  }

  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height) throw new Error(`${label} decoded to an image with no dimensions.`);
  if (Math.min(meta.width, meta.height) < minSide) {
    // Upscale rather than fail: a 32px favicon is still the site's real brand
    // mark, and Android needs 432px. Nearest-neighbour keeps edges crisp.
    png = await sharp(png)
      .resize(Math.max(minSide, 512), Math.max(minSide, 512), { fit: "contain", kernel: "nearest", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }
  const final = await sharp(png).metadata();
  console.log(`${label}: ${format} ${meta.width}x${meta.height} -> png ${final.width}x${final.height} (${png.length} bytes)`);
  return png;
}
