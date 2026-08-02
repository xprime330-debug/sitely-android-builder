// Step 2 of the asset pipeline. Runs AFTER `npx cap add android` (which lays
// down the default Capacitor icons) and BEFORE gradle, overwriting every
// launcher/splash resource with assets derived from THIS build's images.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildTargets, sha256, RES_DIR } from "./asset-pipeline.mjs";

const manifest = JSON.parse(readFileSync("asset-manifest.json", "utf8"));

if (!existsSync(RES_DIR)) {
  throw new Error(`Android resources missing at ${RES_DIR}. Run "npx cap add android" first.`);
}

const icon = existsSync("resources/icon.png") ? readFileSync("resources/icon.png") : undefined;
const splash = existsSync("resources/splash.png") ? readFileSync("resources/splash.png") : undefined;

if (!icon && !splash) {
  console.log("No custom assets for this build; nothing to apply.");
  process.exit(0);
}

const targets = await buildTargets({ icon, splash, background: manifest.background });

manifest.generated = {};
for (const { path, buffer } of targets) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
  manifest.generated[path] = { sha256: sha256(buffer), bytes: buffer.length };
  console.log(`wrote ${path} (${buffer.length} bytes)`);
}

// Adaptive icon background must match the brand, not Capacitor's default purple.
if (icon) {
  const bg = /^#[0-9a-fA-F]{6}$/.test(manifest.background) ? manifest.background : "#0B0B1A";
  const file = `${RES_DIR}/values/ic_launcher_background.xml`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bg}</color>\n</resources>\n`,
  );
  console.log(`wrote ${file} (${bg})`);
}

manifest.applied_at = new Date().toISOString();
writeFileSync("asset-manifest.json", JSON.stringify(manifest, null, 2));
console.log(`Applied ${targets.length} resource files for build ${manifest.build_id}.`);

// --- Adaptive icons (Android 8+) -----------------------------------------
// Capacitor's template ships a VECTOR ic_launcher_foreground drawable; the
// adaptive-icon XML points at it, so launchers on Android 8+ draw the default
// artwork even when our mipmap PNGs are correct. Repoint the adaptive icon at
// our generated PNG foreground and remove the default vector entirely.
if (icon) {
  const bg = /^#[0-9a-fA-F]{6}$/.test(manifest.background) ? manifest.background : "#0B0B1A";
  const adaptive =
    `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
    `    <background android:drawable="@color/ic_launcher_background"/>\n` +
    `    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`;
  for (const dir of ["mipmap-anydpi-v26", "mipmap-anydpi-v33"]) {
    for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
      const file = `${RES_DIR}/${dir}/${name}`;
      if (dir === "mipmap-anydpi-v33" && !existsSync(file)) continue;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, adaptive);
      manifest.generated[file] = { sha256: sha256(Buffer.from(adaptive)), bytes: Buffer.byteLength(adaptive) };
      console.log(`wrote ${file}`);
    }
  }

  // Kill every default vector/XML foreground + background so nothing can
  // resolve back to Capacitor artwork.
  for (const stale of [
    `${RES_DIR}/drawable/ic_launcher_foreground.xml`,
    `${RES_DIR}/drawable-v24/ic_launcher_foreground.xml`,
    `${RES_DIR}/drawable-anydpi-v24/ic_launcher_foreground.xml`,
    `${RES_DIR}/drawable/ic_launcher_background.xml`,
  ]) {
    if (existsSync(stale)) {
      rmSync(stale);
      console.log(`removed default ${stale}`);
    }
  }
  // ic_launcher_background must exist as a colour resource after the removal.
  const colors = `${RES_DIR}/values/ic_launcher_background.xml`;
  writeFileSync(
    colors,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bg}</color>\n</resources>\n`,
  );
  manifest.generated[colors] = { color: bg };
  writeFileSync("asset-manifest.json", JSON.stringify(manifest, null, 2));
}
