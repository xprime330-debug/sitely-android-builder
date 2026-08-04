// Step 1 of the asset pipeline.
// Writes capacitor.config.json + www placeholder, then downloads the icon and
// splash image for THIS build, normalises them to PNG and records their hashes
// in asset-manifest.json. Any download problem is fatal with the real reason:
// we never silently fall back to the default Capacitor icon.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { schemeFor, allowNavigationFor, htmlLooksLikeGoogleAuth } from "./native-config.mjs";
import { normalizeToPng } from "./image.mjs";

const {
  BUILD_ID = "unknown",
  APP_NAME = "Sitely App",
  PACKAGE_ID = "app.sitely.generated",
  SITE_URL = "https://example.com",
  ICON_URL = "",
  SPLASH_URL = "",
  SPLASH_COLOR = "#0B0B1A",
  THEME_COLOR = "#4F46E5",
  NATIVE_JSON = "{}",
} = process.env;

let nativeOpts = {};
try {
  nativeOpts = JSON.parse(NATIVE_JSON || "{}");
} catch {
  throw new Error("native_json input is not valid JSON.");
}
const redirectScheme = nativeOpts.redirect_scheme || schemeFor(PACKAGE_ID);
const externalLinks = nativeOpts.external_links === "external_browser" ? "external_browser" : "in_app";

const config = {
  appId: PACKAGE_ID,
  appName: APP_NAME,
  webDir: "www",
  server: {
    url: SITE_URL,
    cleartext: false,
    androidScheme: "https",
    allowNavigation: allowNavigationFor(SITE_URL),
  },
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

async function download(label, url, minSide) {
  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "SitelyBuilder/1.0", Accept: "image/*,*/*" },
    });
  } catch (err) {
    throw new Error(`${label} download failed: ${err.message} (${url})`);
  }
  if (!res.ok) {
    throw new Error(`${label} download failed: HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`${label} download returned 0 bytes (${url}).`);
  return normalizeToPng(label, buf, minSide);
}

mkdirSync("resources", { recursive: true });

let expectsGoogleAuth = Boolean(nativeOpts.expects_google_auth);
if (!expectsGoogleAuth) {
  try {
    const res = await fetch(SITE_URL, {
      redirect: "follow",
      headers: { "User-Agent": "SitelyBuilder/1.0" },
    });
    if (res.ok) {
      const html = (await res.text()).slice(0, 400_000);
      expectsGoogleAuth = htmlLooksLikeGoogleAuth(html);
    }
  } catch (err) {
    console.log(`Google Sign-In detection skipped: ${err.message}`);
  }
}
console.log(`Google Sign-In expected for this build: ${expectsGoogleAuth}`);

const manifest = {
  build_id: BUILD_ID,
  background: SPLASH_COLOR,
  theme: THEME_COLOR,
  sources: {},
  native: {
    redirect_scheme: redirectScheme,
    external_links: externalLinks,
    expects_google_auth: expectsGoogleAuth,
  },
};

if (ICON_URL) {
  const buf = await download("Icon", ICON_URL, 512);
  writeFileSync("resources/icon.png", buf);
  manifest.sources.icon = { url: ICON_URL, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
} else {
  console.log("No icon_url supplied for this build — default launcher icon will be used.");
}

if (SPLASH_URL) {
  const buf = await download("Splash", SPLASH_URL, 512);
  writeFileSync("resources/splash.png", buf);
  manifest.sources.splash = { url: SPLASH_URL, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
} else {
  console.log("No splash_url supplied — flat colour splash will be used.");
}

writeFileSync("asset-manifest.json", JSON.stringify(manifest, null, 2));
console.log("Prepared:", { BUILD_ID, APP_NAME, PACKAGE_ID, SITE_URL, THEME_COLOR });
