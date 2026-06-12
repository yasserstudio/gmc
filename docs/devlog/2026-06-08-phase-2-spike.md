---
title: "The Phase 2 spike: proving the wedge"
date: 2026-06-08
---

# The Phase 2 spike: proving the wedge

_2026-06-08_

Google is retiring the Content API for Shopping in favor of the [Merchant API](https://developers.google.com/merchant/api). Thousands of merchants and agencies have to migrate, and the tooling is thin. That is the opening GMC is built for.

But before building breadth, the plan front-loads one question: **does the wedge feel real?** So the first milestone isn't a broad feature set — it's a single arc against one live Merchant Center account.

## The arc

- **auth** — service account, OAuth, and Application Default Credentials, with the new per-sub-API scopes.
- **`doctor`** — diagnose the _silent_ failure where a credential authenticates fine but the Cloud project was never registered, so every call returns a cryptic empty result. This is the number-one migration trap, and catching it offline is the whole point.
- **accounts** — `list` / `get` / `info`, where `info` composes the account with its business info and homepage.
- **products** — `list` / `get` / `insert` / `delete`: read processed products (with their disapproval status) and write product inputs from version-controllable JSON.

That arc — authenticate, diagnose, then round-trip real catalog data — exercises the whole thesis at minimum cost.

## What the Merchant API taught us

A few sharp edges shaped the design:

- **Products are two resources, not one.** The processed `products` resource is read-only and carries status; writes go through a separate `productInputs` resource (insert/delete only). gmc presents both under `gmc products`, but the split is real.
- **Inserts need a data source.** You can't insert a product without naming a primary API data source — so `insert` and `delete` take a `--data-source`. Managing data sources is its own phase (v0.8).
- **Everything is rate-limited per sub-API.** The typed client carries a six-bucket rate limiter, retry/backoff, and pagination so commands don't each reinvent them.
- **Failures need classes.** Every command emits `--json` and a classed exit code (usage, auth, config, api) so CI can branch on _why_ something failed.

## Where this lands

Phase 2 ships as **v0.7.0** — the first tagged release. Next is Phase 3: feeds as code (data sources, then pull / push / diff), on the way to the real differentiators — the offline preflight scanner and the Content API migration assistant.

Follow along in the [changelog](https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md) and the [roadmap](/guide/roadmap).
