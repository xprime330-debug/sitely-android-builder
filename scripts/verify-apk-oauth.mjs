// Post-compile proof for the OAuth layer: the shipped APK itself must contain
// the Custom Tabs code and this build's redirect scheme. Complements
// verify-apk.mjs (icon/splash pixels).
import { readFileSync } from "node:fs";
import { open } from "yauzl-promise";

const apkPath = process.argv[2];
if (!apkPath) {
  console.error("usage: node scripts/verify-apk-oauth.mjs <apk>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("asset-manifest.json", "utf8"));
const native = manifest.native ?? {};
const scheme = native.redirect_scheme;
if (!scheme) {
  console.error("asset-manifest.json has no native.redirect_scheme — cannot verify APK OAuth wiring.");
  process.exit(1);
}

async function readEntry(name) {
  const zip = await open(apkPath);
  try {
    for await (const entry of zip) {
      if (entry.filename === name) {
        const stream = await entry.openReadStream();
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        return Buffer.concat(chunks);
      }
    }
  } finally {
    await zip.close();
  }
  return null;
}

async function dexContains(needle) {
  const zip = await open(apkPath);
  try {
    for await (const entry of zip) {
      if (!/^classes\d*\.dex$/.test(entry.filename)) continue;
      const stream = await entry.openReadStream();
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      if (Buffer.concat(chunks).includes(needle)) return true;
    }
  } finally {
    await zip.close();
  }
  return false;
}

const problems = [];

const binManifest = await readEntry("AndroidManifest.xml");
if (!binManifest) {
  problems.push("APK has no AndroidManifest.xml");
} else {
  // Binary XML keeps string-pool values as UTF-16 (and sometimes UTF-8).
  const has = (s) =>
    binManifest.includes(Buffer.from(s, "utf16le")) || binManifest.includes(Buffer.from(s, "utf8"));
  if (!has(scheme)) problems.push(`packaged manifest does not declare the ${scheme}:// redirect scheme`);
  if (!has("android.intent.category.BROWSABLE")) problems.push("packaged manifest has no BROWSABLE deep link");
  if (!has("android.support.customtabs.action.CustomTabsService")) {
    problems.push("packaged manifest is missing the Custom Tabs <queries> entry");
  }
}

if (!(await dexContains(Buffer.from("androidx/browser/customtabs/CustomTabsIntent")))) {
  problems.push("compiled dex does not contain androidx.browser CustomTabsIntent");
}
if (!(await dexContains(Buffer.from("accounts.google.com")))) {
  problems.push("compiled dex does not contain the Google OAuth host list");
}

if (problems.length) {
  console.error("\n=== APK OAUTH VERIFICATION FAILED ===");
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}

console.log(`APK OAuth wiring verified inside ${apkPath}: Custom Tabs present, ${scheme}:// deep link declared.`);
