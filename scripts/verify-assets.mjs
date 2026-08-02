// Step 3 (hard gate). Recomputes the expected bytes from this build's source
// images and compares them byte-for-byte (sha256) against what is actually on
// disk in android/app/src/main/res. Any mismatch fails the build loudly instead
// of shipping an APK with the default Capacitor icon.
import { existsSync, readFileSync, statSync } from "node:fs";
import { buildTargets, sha256, RES_DIR } from "./asset-pipeline.mjs";

const manifest = JSON.parse(readFileSync("asset-manifest.json", "utf8"));
const wantIcon = Boolean(manifest.sources?.icon);
const wantSplash = Boolean(manifest.sources?.splash);

if (!wantIcon && !wantSplash) {
  console.log("No custom icon/splash requested for this build — nothing to verify.");
  process.exit(0);
}

const icon = wantIcon ? readFileSync("resources/icon.png") : undefined;
const splash = wantSplash ? readFileSync("resources/splash.png") : undefined;

// Source integrity: the downloaded file must still be the one we hashed.
for (const [kind, buf] of [["icon", icon], ["splash", splash]]) {
  if (!buf) continue;
  const got = sha256(buf);
  if (got !== manifest.sources[kind].sha256) {
    fail(`Source ${kind} changed after download (expected ${manifest.sources[kind].sha256}, got ${got}).`);
  }
}

const expected = await buildTargets({ icon, splash, background: manifest.background });
const problems = [];

for (const { path, buffer } of expected) {
  if (!existsSync(path)) {
    problems.push(`MISSING  ${path}`);
    continue;
  }
  const onDisk = readFileSync(path);
  const a = sha256(onDisk);
  const b = sha256(buffer);
  if (a !== b) {
    problems.push(`MISMATCH ${path}\n           on disk: ${a} (${onDisk.length} bytes, mtime ${statSync(path).mtime.toISOString()})\n           expected: ${b} (${buffer.length} bytes)`);
  }
}

if (problems.length) {
  fail(
    `Asset validation failed for build ${manifest.build_id}: ${problems.length} of ${expected.length} resource files do not match the generated assets.\n` +
      problems.join("\n") +
      `\n\nThe APK would have shipped with the default Capacitor icon/splash. Refusing to compile.`,
  );
}

console.log(
  `Asset validation passed: ${expected.length} launcher/splash resources under ${RES_DIR} match build ${manifest.build_id}` +
    ` (icon ${wantIcon ? manifest.sources.icon.sha256.slice(0, 12) : "n/a"}, splash ${wantSplash ? manifest.sources.splash.sha256.slice(0, 12) : "n/a"}).`,
);

function fail(message) {
  console.error(`\n::error::${message.split("\n")[0]}`);
  console.error(message);
  process.exit(1);
}
