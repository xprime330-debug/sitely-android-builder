// Step 6 (post-compile gate). Pulls the launcher icon and splash out of the
// packaged APK and compares their PIXELS against the resources we generated.
// Byte comparison is not usable here: aapt2 re-encodes ("crunches") PNGs and
// appends density qualifiers such as `-v4` to resource folder names.
import { readFileSync } from "node:fs";
import { open } from "yauzl-promise";
import sharp from "sharp";
import { sha256 } from "./asset-pipeline.mjs";

const apk = process.argv[2];
if (!apk) throw new Error("Usage: node scripts/verify-apk.mjs <path-to-apk>");

const manifest = JSON.parse(readFileSync("asset-manifest.json", "utf8"));
if (!manifest.generated) {
  console.log("No custom assets in this build — skipping APK asset verification.");
  process.exit(0);
}

async function pixels(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { hash: sha256(data), dims: `${info.width}x${info.height}` };
}

const checks = [];
if (manifest.sources?.icon) {
  checks.push({
    label: "launcher icon (xxxhdpi)",
    match: /(^|\/)mipmap-xxxhdpi[^/]*\/ic_launcher\.png$/,
    local: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
  });
  checks.push({
    label: "round launcher icon (xxxhdpi)",
    match: /(^|\/)mipmap-xxxhdpi[^/]*\/ic_launcher_round\.png$/,
    local: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png",
  });
}
if (manifest.sources?.splash) {
  checks.push({
    label: "splash image",
    match: /(^|\/)drawable[^/]*\/splash\.png$/,
    local: "android/app/src/main/res/drawable/splash.png",
  });
}

// Collect every candidate entry from the APK in one pass.
const entries = new Map();
const zip = await open(apk);
try {
  for await (const entry of zip) {
    if (!checks.some((c) => c.match.test(entry.filename))) continue;
    const stream = await entry.openReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    entries.set(entry.filename, Buffer.concat(chunks));
  }
} finally {
  await zip.close();
}

const problems = [];
for (const check of checks) {
  const names = [...entries.keys()].filter((n) => check.match.test(n));
  if (names.length === 0) {
    problems.push(`MISSING from APK: ${check.label} (no entry matching ${check.match})`);
    continue;
  }
  const want = await pixels(readFileSync(check.local));
  let ok = false;
  const seen = [];
  for (const name of names) {
    const got = await pixels(entries.get(name));
    seen.push(`${name} -> ${got.dims} ${got.hash.slice(0, 12)}`);
    if (got.hash === want.hash && got.dims === want.dims) ok = true;
  }
  if (ok) {
    console.log(`OK  ${check.label}: ${want.dims} pixels match ${want.hash.slice(0, 12)}`);
  } else {
    problems.push(
      `MISMATCH in APK: ${check.label}\n           expected: ${want.dims} ${want.hash.slice(0, 12)}\n           found:    ${seen.join("\n                     ")}`,
    );
  }
}

if (problems.length) {
  const head = `APK asset validation failed for build ${manifest.build_id}: packaged artwork does not match the generated icon/splash.`;
  console.error(`\n::error::${head}`);
  console.error(`${head}\n${problems.join("\n")}\n\nRefusing to publish an APK with default artwork.`);
  process.exit(1);
}

console.log(`APK asset validation passed: ${checks.length} packaged resource(s) match build ${manifest.build_id}.`);
