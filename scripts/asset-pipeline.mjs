// Deterministic Capacitor Android asset generation.
//
// Both apply-assets.mjs (writes) and verify-assets.mjs (checks) import this
// module, so the "expected" bytes are produced by exactly the same code path.
// sharp is pinned to an exact version in package.json so output is byte-stable.
import { createHash } from "node:crypto";
import sharp from "sharp";

export const LAUNCHER_DENSITIES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

// Adaptive-icon foreground layers are 108dp; the visible circle is the middle 72dp.
export const FOREGROUND_DENSITIES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

export const SPLASH_SIZES = {
  "drawable": [1920, 1920],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
};

export const RES_DIR = "android/app/src/main/res";

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function png(pipeline) {
  // Fixed PNG encoder options => deterministic bytes.
  return pipeline.png({ compressionLevel: 9, effort: 7, palette: false }).toBuffer();
}

async function square(icon, size) {
  return png(
    sharp(icon)
      .resize(size, size, { fit: "cover", position: "centre", kernel: "lanczos3" })
      .removeAlpha()
      .toColourspace("srgb"),
  );
}

async function round(icon, size) {
  const base = await square(icon, size);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return png(
    sharp(base).composite([{ input: mask, blend: "dest-in" }]).ensureAlpha(),
  );
}

async function foreground(icon, size) {
  // Icon occupies the inner 66% so Android's adaptive mask never clips it.
  const inner = Math.round(size * 0.66);
  const layer = await sharp(icon)
    .resize(inner, inner, { fit: "cover", position: "centre", kernel: "lanczos3" })
    .png()
    .toBuffer();
  return png(
    sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite([{ input: layer, gravity: "centre" }]),
  );
}

async function splashAt(splash, [w, h], background) {
  return png(
    sharp(splash)
      .resize(w, h, { fit: "cover", position: "centre", kernel: "lanczos3" })
      .flatten({ background })
      .removeAlpha()
      .toColourspace("srgb"),
  );
}

/**
 * Returns the full list of Android resource files this build must contain.
 * @param {{icon?: Buffer, splash?: Buffer, background: string}} input
 * @returns {Promise<Array<{path: string, buffer: Buffer}>>}
 */
export async function buildTargets({ icon, splash, background }) {
  const targets = [];

  if (icon) {
    for (const [density, size] of Object.entries(LAUNCHER_DENSITIES)) {
      targets.push({
        path: `${RES_DIR}/mipmap-${density}/ic_launcher.png`,
        buffer: await square(icon, size),
      });
      targets.push({
        path: `${RES_DIR}/mipmap-${density}/ic_launcher_round.png`,
        buffer: await round(icon, size),
      });
    }
    for (const [density, size] of Object.entries(FOREGROUND_DENSITIES)) {
      targets.push({
        path: `${RES_DIR}/mipmap-${density}/ic_launcher_foreground.png`,
        buffer: await foreground(icon, size),
      });
    }
  }

  if (splash) {
    for (const [dir, size] of Object.entries(SPLASH_SIZES)) {
      targets.push({
        path: `${RES_DIR}/${dir}/splash.png`,
        buffer: await splashAt(splash, size, background),
      });
    }
  }

  return targets;
}
