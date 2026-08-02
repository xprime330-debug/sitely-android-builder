// Step 6 (post-compile gate). Reads res/mipmap-xxxhdpi/ic_launcher.png and
// drawable/splash.png out of the packaged APK and compares them against the
// resources we generated. Catches any packaging-level regression that would
// ship the default Capacitor artwork.
import { readFileSync } from "node:fs";
import { open } from "yauzl-promise";
import { sha256 } from "./asset-pipeline.mjs";

const apk = process.argv[2];
if (!apk) throw new Error("Usage: node scripts/verify-apk.mjs <path-to-apk>");

const manifest = JSON.parse(readFileSync("asset-manifest.json", "utf8"));
if (!manifest.generated) {
  console.log("No custom assets in this build — skipping APK asset verification.");
  process.exit(0);
}

const checks = [];
if (manifest.sources?.icon) {
  checks.push(["res/mipmap-xxxhdpi/ic_launcher.png", "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"]);
  checks.push(["res/mipmap-xxxhdpi/ic_launcher_round.png", "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png"]);
}
if (manifest.sources?.splash) {
  checks.push(["res/drawable/splash.png", "android/app/src/main/res/drawable/splash.png"]);
}

const wanted = new Map(checks.map(([inApk, onDisk]) => [inApk, sha256(readFileSync(onDisk))]));
const found = new Map();

const zip = await open(apk);
try {
  for await (const entry of zip) {
    if (!wanted.has(entry.filename)) continue;
    const stream = await entry.openReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    found.set(entry.filename, sha256(Buffer.concat(chunks)));
  }
} finally {
  await zip.close();
}

const problems = [];
for (const [name, expectedHash] of wanted) {
  const actual = found.get(name);
  if (!actual) problems.push(`MISSING from APK: ${name}`);
  else if (actual !== expectedHash) {
    problems.push(`MISMATCH in APK: ${name}\n           apk: ${actual}\n           expected: ${expectedHash}`);
  }
}

if (problems.length) {
  const head = `APK asset validation failed for build ${manifest.build_id}: packaged artwork does not match the generated icon/splash.`;
  console.error(`\n::error::${head}`);
  console.error(`${head}\n${problems.join("\n")}\n\nRefusing to publish an APK with default artwork.`);
  process.exit(1);
}

console.log(`APK asset validation passed: ${wanted.size} packaged resource(s) match build ${manifest.build_id}.`);
