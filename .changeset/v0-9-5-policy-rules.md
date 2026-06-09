---
"@gmc-cli/preflight": patch
---

preflight: policy / disapproval-trigger checks (Phase 4 exit)

Add a `policy.*` rule family for the editorial triggers Merchant Center disapproves products for — heuristic, offline, no engine change:

- `policy.promotional-title` (**error**) — promotional text in the title (e.g. "free shipping", "20% off", "best price", "buy now"). A curated, high-precision phrase set, since this rule gates.
- `policy.title-caps` (warning) — SHOUTING titles (most letters uppercase).
- `policy.title-symbols` (warning) — gimmicky symbols, repeated punctuation, or emoji in the title.
- `policy.phone-in-title` (warning) — a formatted phone number in the title.
- `policy.link-https` (warning) — the landing-page `link` uses `http`, not `https`.

All are present-only and tunable in `.gmcpreflightrc`. This closes Phase 4: `gmc preflight` now catches a real disapproval offline before upload.
