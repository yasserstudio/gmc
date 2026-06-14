---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(accounts): add `developer-registration` commands and a doctor registration hint

Adds `gmc accounts developer-registration` (`register` / `get` / `unregister`) for
the Merchant API `accounts/v1` `developerRegistration` resource — the one-time step
that registers the calling Cloud project with a Merchant Center account. Until it is
done the API returns a `GCP project … is not registered with the merchant account`
**401** even though the token is valid; previously gmc had no command for it, so the
fix required a raw API call.

`gmc doctor` now recognizes that "not registered" 401 and points at
`gmc accounts developer-registration register` instead of suggesting
re-authentication (the token is fine — the project just isn't registered).

`register` accepts an optional `--developer-email`; `unregister` requires `--yes`.
