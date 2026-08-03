// Shared helpers for the native (Android/Java) layer of a generated app.
// Kept in its own module so prepare / apply / verify all agree on the exact
// markers they look for — the verifier is only meaningful if it checks the
// same strings the generator writes.
export const MARKER = "SITELY_NATIVE_V1";

// Endpoints that MUST NOT be opened in an embedded WebView. Google actively
// blocks OAuth inside WebViews (`disallowed_useragent`) and this cannot be
// worked around, so these go to Chrome Custom Tabs instead.
export const OAUTH_HOSTS = [
  "accounts.google.com",
  "accounts.youtube.com",
  "oauth2.googleapis.com",
  "myaccount.google.com",
  "appleid.apple.com",
  "login.microsoftonline.com",
  "login.live.com",
  "github.com/login/oauth",
  "www.facebook.com/dialog/oauth",
  "www.linkedin.com/oauth",
  "x.com/i/oauth2",
  "twitter.com/i/oauth2",
];

export const OAUTH_PATHS = [
  "/o/oauth2/",
  "/signin/oauth",
  "/gsi/",
  "/oauth2/authorize",
  "/oauth/authorize",
  "/authorize",
];

/** Deterministic, valid Android URL scheme derived from the package id. */
export function schemeFor(packageId, fallback = "sitelyapp") {
  const slug = String(packageId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return slug ? `sitely${slug}`.slice(0, 40) : fallback;
}

export function originOf(siteUrl) {
  return new URL(siteUrl).origin;
}

/** Host wildcards that should stay inside the app's own WebView. */
export function allowNavigationFor(siteUrl) {
  const host = new URL(siteUrl).hostname;
  const bare = host.replace(/^www\./, "");
  return [host, bare, `*.${bare}`];
}

const GOOGLE_AUTH_SIGNALS = [
  "accounts.google.com",
  "apis.google.com/js/platform",
  "accounts.google.com/gsi/client",
  "data-client_id",
  "g_id_signin",
  "signinwithgoogle",
  "sign in with google",
  "signin_with_google",
  "continue with google",
  "supabase.co/auth/v1/authorize?provider=google",
  "provider=google",
];

/** Best-effort detection of a Google Sign-In surface on the target site. */
export function htmlLooksLikeGoogleAuth(html) {
  const hay = String(html || "").toLowerCase();
  return GOOGLE_AUTH_SIGNALS.some((s) => hay.includes(s));
}
