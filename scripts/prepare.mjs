// Step 1 of the asset pipeline.
// Writes capacitor.config.json + www placeholder, then downloads the icon and
// splash image for THIS build and records their hashes in asset-manifest.json.
// Any download problem is fatal: we never silently fall back to the default
// Capacitor icon.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

const {
  BUILD_ID = "unknown",
  APP_NAME = "Sitely App",
  PACKAGE_ID = "app.sitely.generated",
  SITE_URL = "https://example.com",
  ICON_URL = "",
  SPLASH_URL = "",
  SPLASH_COLOR = "#0B0B1A",
  THEME_COLOR = "#4F46E5",
} = process.env;

const config = {
  appId: PACKAGE_ID,
  appName: APP_NAME,
  webDir: "www",
  server: { url: SITE_URL, cleartext: false, androidScheme: "https" },
  android: { backgroundColor: SPLASH_COLOR },
  plugins: {
    SplashScreen: {
      backgroundColor: SPLASH_COLOR,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      launchAutoHide: true,
      launchShowDuration: 1200,
    },
  },
};
writeFileSync("capacitor.config.json", JSON.stringify(config, null, 2));

if (!existsSync("www")) mkdirSync("www", { recursive: true });
writeFileSync(
  "www/index.html",
  `<!doctype html><meta charset="utf-8"><title>${APP_NAME}</title>
<style>html,body{margin:0;height:100%;background:${SPLASH_COLOR};color:#fff;
font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;text-align:center}</style>
<div><h1>${APP_NAME}</h1><p>Loading…</p></div>
<script>location.href=${JSON.stringify(SITE_URL)}</script>`,
);

async function download(label, url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`${label} download failed: HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) {
    throw new Error(`${label} download too small (${buf.length} bytes) — not a usable image.`);
  }
  const isPng = buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (!isPng && !isJpg && !isWebp) {
    throw new Error(`${label} is not a PNG/JPEG/WebP image.`);
  }
  console.log(`${label} downloaded: ${buf.length} bytes`);
  return buf;
}

mkdirSync("resources", { recursive: true });
const manifest = { build_id: BUILD_ID, background: SPLASH_COLOR, theme: THEME_COLOR, sources: {} };

if (ICON_URL) {
  const buf = await download("Icon", ICON_URL);
  writeFileSync("resources/icon.png", buf);
  manifest.sources.icon = { url: ICON_URL, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
} else {
  console.log("No icon_url supplied for this build — default launcher icon will be used.");
}

if (SPLASH_URL) {
  const buf = await download("Splash", SPLASH_URL);
  writeFileSync("resources/splash.png", buf);
  manifest.sources.splash = { url: SPLASH_URL, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
} else {
  console.log("No splash_url supplied — flat colour splash will be used.");
}

writeFileSync("asset-manifest.json", JSON.stringify(manifest, null, 2));
console.log("Prepared:", { BUILD_ID, APP_NAME, PACKAGE_ID, SITE_URL, THEME_COLOR });
