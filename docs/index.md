---
layout: home
hero:
  name: gmc
  text: The Google Merchant Center CLI
  tagline: Typed, CI-friendly access to the Google Merchant API — with an offline feed-compliance preflight.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: CLI reference
      link: /reference/
    - theme: alt
      text: View on GitHub
      link: https://github.com/yasserstudio/gmc
features:
  - title: Typed Merchant API
    details: A typed client for full account management (profile, users, lifecycle, shipping, return policies), products, data sources, inventory, promotions, regions, and reports — per-sub-API rate limiting, retry/backoff, and pagination built in.
  - title: gmc doctor
    details: Diagnoses the silent GCP-registration / API-not-enabled trap that quietly breaks Merchant API access.
  - title: Offline preflight
    details: gmc preflight scans your feed for required-attribute, format, and disapproval-trigger issues locally — no API call — so you catch a rejection before upload.
  - title: Content API → Merchant API
    details: gmc migrate moves you off the retired Content API — scope/auth audit, product transform (price→micros, field remap), and a feed-label safety check.
  - title: Feeds as code
    details: Pull your catalog to version-controllable JSON, diff what would change, and push it back. Inventory and promotions too.
  - title: Built for CI
    details: "--json everywhere and classed exit codes, plus a GitHub Action and GitLab recipe — gate a merge on preflight or a performance threshold."
---
