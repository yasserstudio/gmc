---
title: "v1.0.16: ordertracking, and keeping the docs honest"
date: 2026-07-01
---

# v1.0.16: ordertracking, and keeping the docs honest

_2026-07-01_

v1.0.16 adds `gmc ordertracking` — the **Order Tracking** sub-API (`ordertracking/v1`). It was the last remaining GA (`v1`) Merchant API sub-API, so the stable v1 surface is now fully covered: **12 of 12 GA sub-APIs**. But the more interesting part of this release wasn't the code — it was the two checks that decided _what_ to build and _whether the docs still told the truth afterward_.

## A contract that wasn't there

The plan started somewhere else. Picking the next sub-API to cover, the obvious candidate was `reviews` — product and merchant reviews, broad appeal, and a web search cheerfully confirmed it had "graduated to v1 GA."

It hadn't. A quick probe of Google's live discovery service settled it:

```sh
curl -s -o /dev/null -w "%{http_code}" \
  "https://merchantapi.googleapis.com/\$discovery/rest?version=reviews_v1"
# → 404
```

`reviews_v1` returns **404**. Reviews exists only at `v1beta` (past a publicized sunset) and `v1alpha`. The search summary was simply wrong — the exact trap that bit us once before, when v1 quietly renamed a product field and 100%-mocked tests sailed right past it. So the rule held: **verify an API version _exists_ before building against it, from discovery or the proto — never from a search snippet.**

`ordertracking`, on the other hand, was genuinely GA (`ordertracking_v1` → 200) and genuinely uncovered. That became the deliverable. It's a small, write-only sub-API — a single `create` that reports a completed shipment so Google can show accurate delivery estimates; there's no get/list/update/delete because a signal is immutable once sent. The wire shape was verified against the `ordertracking/v1` proto: the signal is posted as the request body with **no** `dataSource` (unlike products and promotions, which do take one).

## The alignment pass

Shipping a new command touches more than one file, and the claims scattered through the docs go stale quietly. "All 11 Merchant API sub-APIs are covered" was true last week; the moment `ordertracking` merged, it was a lie in six places. So every release ends with a deliberate sweep for exactly those claims:

| Checked                                                          | Result                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| Sub-API count claims (`index.md`, `guide/index.md`, `README.md`) | 11 → **12 GA**, list now includes `ordertracking`       |
| "Latest version" references                                      | → `v1.0.16`                                             |
| Reference page + sidebar + reference index                       | new `ordertracking` page wired in three places          |
| CHANGELOGs (cli / api / auth)                                    | generated: 1.0.16 / 0.9.21 / 0.7.3                      |
| Roadmap                                                          | Phase 12 row + prose; pre-GA sub-APIs noted as deferred |

Just as important is knowing what _not_ to touch. Three things looked like drift but weren't:

- The two remaining "all 11 sub-APIs" mentions are **historical roadmap rows** — Phase 10 really did complete 11. Rewriting history to say 12 would be the actual error.
- `reports.md`'s "conversions" is a **metric name**, not a stale command reference.
- The MCP server advertises "12 tools" — a _curated_ set, unrelated to the 12 sub-APIs, and it makes no "covers everything" claim. `ordertracking` isn't an MCP tool, and that's a product choice, not a doc bug.

Finally, the docs CI build is the backstop: it rebuilds the whole site on every push to `main`, so a new page that isn't wired into the sidebar, or a dead cross-link, fails the build rather than shipping broken.

## Where this lands

v1.0.16 completes the GA surface — **all 12 `v1` Merchant API sub-APIs**, live on npm, the standalone binaries, and Homebrew. `reviews`, `productstudio`, and `youtube` remain pre-GA (`v1beta`/`v1alpha`) and are on hold until they graduate to `v1`; when they do, the discovery probe will say so.

Follow along in the [changelog](https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md) and the [roadmap](/guide/roadmap).
