// Generates capacitor.config.json, www/index.html placeholder, and optional icon
// from workflow inputs (env vars).
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { Buffer } from "node:buffer";

const {
  APP_NAME = "Sitely App",
  PACKAGE_ID = "app.sitely.generated",
  SITE_URL = "https://example.com",
  ICON_URL = "",
  SPLASH_COLOR = "#0B0B1A",
  THEME_COLOR = "#4F46E5",
} = process.env;

// Capacitor config - server.url loads the remote site as the app content.
const config = {
  appId: PACKAGE_ID,
  appName: APP_NAME,
  webDir: "www",
  server: { url: SITE_URL, cleartext: false, androidScheme: "https" },
  android: { backgroundColor: SPLASH_COLOR },
};
writeFileSync("capacitor.config.json", JSON.stringify(config, null, 2));

// Fallback offline page (used only if server.url unreachable).
if (!existsSync("www")) mkdirSync("www", { recursive: true });
writeFileSync(
  "www/index.html",
  `<!doctype html><meta charset="utf-8"><title>${APP_NAME}</title>
<style>html,body{margin:0;height:100%;background:${SPLASH_COLOR};color:#fff;
font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;text-align:center}</style>
<div><h1>${APP_NAME}</h1><p>Loading…</p></div>
<script>location.href=${JSON.stringify(SITE_URL)}</script>`,
);

// Download icon if provided (best-effort).
if (ICON_URL) {
  try {
    const res = await fetch(ICON_URL);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      mkdirSync("resources", { recursive: true });
      writeFileSync("resources/icon.png", buf);
      console.log("Icon downloaded:", buf.length, "bytes");
    } else {
      console.warn("Icon fetch failed:", res.status);
    }
  } catch (e) {
    console.warn("Icon fetch error:", e.message);
  }
}

console.log("Prepared:", { APP_NAME, PACKAGE_ID, SITE_URL, THEME_COLOR });
