---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(issues): render account & product issues with `gmc issues`

Adds the `issueresolution/v1` sub-API as `gmc issues` — a read-only window into the
same problems Merchant Center surfaces, so you can see why an account is limited or a
product disapproved without leaving the terminal:

- `gmc issues account` renders account-level issues (`renderaccountissues`).
- `gmc issues product <id>` renders item-level issues for one product
  (`renderproductissues`); accepts a bare product id or a full resource name.
- `--language` / `--time-zone` localize the rendered content; `--json` emits the raw
  `RenderedIssue`s including the prerendered HTML and available actions.

Each issue prints its severity (`DISAPPROVED` / `DEMOTED` / `NOT_IMPACTED`), impact
message, and region/destination breakdown. This completes the diagnostics trio
alongside `doctor` (access) and `preflight` (pre-upload). The allowlist-gated
`triggeraction` write flow is intentionally not exposed.

Adds `issueresolution` as the 9th Merchant API rate-limit bucket.
