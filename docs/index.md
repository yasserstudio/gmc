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
    details: A typed client for Accounts, Products, and more — per-sub-API rate limiting, retry/backoff, and pagination built in.
  - title: gmc doctor
    details: Diagnoses the silent GCP-registration / API-not-enabled trap that quietly breaks Merchant API access.
  - title: Built for CI
    details: "--json everywhere and classed exit codes (usage, auth, config, api) so pipelines can branch on the failure."
  - title: For the Content API cutover
    details: Built for the Content API → Merchant API migration. Round-trip your catalog as version-controllable JSON.
---
