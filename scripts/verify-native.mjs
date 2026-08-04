// Hard gate for the native link/OAuth layer. Mirrors verify-assets.mjs: if the
// wiring for THIS build isn't present on disk, fail loudly rather than ship an
// app whose Google Sign-In is silently broken.
import { readFileSync, existsSync } from "node:fs";
import { MARKER } from "./native-config.mjs";

const manifest = JSON.parse(readFileSync("asset-manifest.json", "utf8"));
const native = manifest.native ?? {};
const expectsGoogleAuth = Boolean(native.expects_google_auth);
const scheme = native.redirect_scheme;
const host = native.site_host;
const packageId = process.env.PACKAGE_ID ?? "";

const problems = [];
function need(cond, message) {
  if (!cond) problems.push(message);
}

need(Boolean(scheme), "asset-manifest.json has no native.redirect_scheme");
need(native.marker === MARKER, `native layer marker missing (expected ${MARKER})`);

const javaPath = `android/app/src/main/java/${packageId.replace(/\./g, "/")}/MainActivity.java`;
if (!existsSync(javaPath)) {
  problems.push(`MainActivity.java missing at ${javaPath}`);
} else {
  const java = readFileSync(javaPath, "utf8");
  need(java.includes(MARKER), "MainActivity.java is not the Sitely-generated one");
  need(
    java.includes("androidx.browser.customtabs.CustomTabsIntent"),
    "MainActivity.java does not import Chrome Custom Tabs",
  );
  need(java.includes("isOAuthUrl"), "MainActivity.java has no OAuth URL detection");
  need(java.includes("accounts.google.com"), "OAuth host list does not include accounts.google.com");
  need(java.includes("openCustomTab(uri)"), "OAuth URLs are not routed to a Custom Tab");
  need(java.includes("handleDeepLink"), "No deep-link return handler for the OAuth redirect");
  need(java.includes("setAcceptThirdPartyCookies"), "WebView cookie/session persistence not configured");
  need(java.includes("canGoBack"), "In-app back navigation through link history not wired");
  need(
    java.includes(`REDIRECT_SCHEME = "${scheme}"`),
    `MainActivity redirect scheme does not match this build (${scheme})`,
  );
  // The failure mode we are guarding against: an embedded user agent that
  // Google rejects, with no escape hatch to a real browser.
  need(
    java.includes("stripWebViewMarker"),
    "WebView user agent still advertises 'wv' (Google answers disallowed_useragent)",
  );
  need(
    java.includes("isBlockedAgentUrl"),
    "No Custom Tabs escape hatch for providers that reject the embedded agent",
  );
}

const gradlePath = "android/app/build.gradle";
if (!existsSync(gradlePath)) {
  problems.push("android/app/build.gradle missing");
} else {
  need(
    readFileSync(gradlePath, "utf8").includes("androidx.browser:browser"),
    "androidx.browser (Custom Tabs) dependency not present in app/build.gradle",
  );
}

const manifestPath = "android/app/src/main/AndroidManifest.xml";
if (!existsSync(manifestPath)) {
  problems.push("AndroidManifest.xml missing");
} else {
  const xml = readFileSync(manifestPath, "utf8");
  need(xml.includes(`android:scheme="${scheme}"`), `AndroidManifest has no ${scheme}:// intent filter`);
  need(xml.includes('android:launchMode="singleTask"'), "MainActivity is not singleTask (deep link would restart the app)");
  need(xml.includes("android.intent.category.BROWSABLE"), "Deep link intent filter is not BROWSABLE");
  need(
    xml.includes("android.support.customtabs.action.CustomTabsService"),
    "Missing <queries> entry for the Custom Tabs service (Android 11+ would not resolve a browser)",
  );
  if (host) {
    need(xml.includes(`android:host="${host}"`), `No https app-link filter for ${host}`);
  }
}

if (problems.length) {
  console.error("\n=== NATIVE OAUTH / LINK VERIFICATION FAILED ===");
  for (const p of problems) console.error(` - ${p}`);
  if (expectsGoogleAuth) {
    console.error(
      "\nThe target site uses Google Sign-In. Shipping this APK would give users a\n" +
        "broken login (disallowed_useragent or a dead browser screen), so the build\n" +
        "is being failed on purpose.",
    );
  }
  process.exit(1);
}

console.log(
  `Native OAuth/link layer verified: scheme=${scheme}://, custom tabs=on, ` +
    `google-signin-site=${expectsGoogleAuth ? "yes" : "not detected"}, links=${native.external_links}`,
);
