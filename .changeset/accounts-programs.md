---
"@gmc-cli/cli": patch
"@gmc-cli/api": patch
---

Add `gmc accounts programs` — `list` / `get` / `enable` / `disable` an account's participation in Merchant Center programs (Free listings, Shopping ads, …) on `accounts/v1`. `get` surfaces the participation state, active regions, and any unmet requirements; `disable` requires `--yes`.
