# sitely-android-builder

Capacitor-based Android APK builder triggered by [Sitely](https://sitely.app) via `workflow_dispatch`.

## Required GitHub Actions secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret | What it is |
| --- | --- |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key |
| `R2_ENDPOINT` | e.g. `https://<accountid>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | R2 bucket name that stores built APKs |
| `R2_PUBLIC_BASE` | Public base URL of the bucket, e.g. `https://apks.example.com` |

## How it's triggered

Sitely's `trigger-build` server function dispatches this workflow with inputs
(`build_id`, `site_id`, `site_url`, `app_name`, `package_id`, `icon_url`,
`splash_color`, `theme_color`, `callback_url`, `callback_secret`).

On success it uploads `out/<build_id>.apk` to R2 and POSTs the public APK URL
back to `callback_url` with header `X-Sitely-Secret: <callback_secret>`.
