# What is gmc?

**gmc** is a command-line interface for the [Google Merchant API](https://developers.google.com/merchant/api) — the successor to the Content API for Shopping. It gives you typed, scriptable, CI-friendly access to your Merchant Center accounts and product data.

It is built around three things the Merchant API makes harder than it should be:

- **`gmc doctor`** — catches the *silent* failure mode where a credential authenticates fine but the Cloud project was never registered / the API was never enabled, so calls return cryptic empty results.
- **preflight** *(coming in Phase 4)* — an offline scanner that flags the attribute, format, and policy problems that get products disapproved, before you upload.
- **`gmc migrate`** *(coming in Phase 5)* — an assistant for moving off the Content API: scope swaps, price-to-micros, identifier remaps, and the feed-label transfer check.

## Why a CLI

Most Merchant Center work is still done by hand in the web UI. A CLI makes it:

- **scriptable** — feeds become version-controllable JSON you can diff and review;
- **CI-friendly** — `--json` on every command and classed exit codes so pipelines can branch on the failure class;
- **honest** — `doctor` tells you *why* something is broken instead of returning an empty list.

## Status

gmc is in the **`0.x` pre-release series**. The current release, **v0.9.0**, completes the Phase 2 spike (authentication, `doctor`, accounts, products) and is partway through Phase 3 — feeds as code: data sources and `feeds pull` have shipped. See the [roadmap](/guide/roadmap) for what is next and the [changelog](https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md) for what has shipped.

Ready to try it? Head to [Getting started](/guide/getting-started).
