---
layout: home
description: "Free, open-source CLI for the Google Merchant API. Typed, CI-friendly access with offline feed preflight, an MCP server for AI assistants, a first-party GitHub Action, and a Content API → Merchant API migrator."
hero:
  name: GMC
  text: The Google Merchant Center CLI
  tagline: Validate feeds offline, diagnose the silent setup trap, and move off the retired Content API — one typed CLI, built for CI.
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
    details: A typed client for the stable Merchant API surface, including the August 2026 Loyalty Customers GA API. Rate limiting, retry/backoff, and pagination are built in, so you don't hand-roll them.
  - title: gmc doctor
    details: Diagnoses the silent GCP-registration / API-not-enabled trap that quietly breaks Merchant API access.
  - title: Offline preflight
    details: gmc preflight scans your feed for required-attribute, format, disapproval-trigger, and SEO-optimization issues locally — no API call — so you catch a rejection before upload.
  - title: Content API → Merchant API
    details: gmc migrate moves you off the retired Content API — scope/auth audit, product transform (price→micros, field remap), and a feed-label safety check.
  - title: Feeds as code
    details: Pull your product catalog to version-controllable JSON, review the diff, and push it back. Your product feed lives in Git.
  - title: GitHub Action
    details: "The first-party GitHub Action (uses: yasserstudio/gmc@v1) runs preflight in CI with inline PR annotations on diffs, a findings summary table in the Actions tab, and structured outputs for downstream steps."
  - title: MCP server
    details: "gmc mcp exposes 12 tools over the Model Context Protocol — products, preflight, diagnostics, and more — so AI assistants like Claude Desktop, Cursor, and VS Code Copilot can work with your Merchant Center data."
  - title: Built for CI
    details: "Block a bad feed from shipping: every command speaks --json and returns a classed exit code, so a GitHub Action or GitLab job can fail the build on a disapproval or a performance drop."
---

> 🚀 **GMC v1.1.0 is live** — all 13 stable Merchant API sub-APIs are covered, including Loyalty Customers, with the August 2026 product, inventory, account, quota, and data-source contracts. [See the release →](https://github.com/yasserstudio/gmc/releases/tag/v1.1.0)
