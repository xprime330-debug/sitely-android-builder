// Step 2 of the asset pipeline. Runs AFTER `npx cap add android` (which lays
// down the default Capacitor icons) and BEFORE gradle, overwriting every
// launcher/splash resource with assets derived from THIS build's images.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
