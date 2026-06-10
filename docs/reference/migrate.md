# gmc migrate

**Content API for Shopping → Merchant API assistant.** Google retires the Content API for Shopping on **August 18, 2026**; `migrate` helps you move to the Merchant API. Phase 5 builds it in three steps — this page documents `migrate scopes` (v0.9.6); `migrate products` and `migrate feed-labels` follow.

```sh
gmc migrate scopes                                   # audit auth readiness
gmc -p mystore migrate scopes --from merchant-info.json          # dry-run a config migration
gmc -p mystore migrate scopes --from merchant-info.json --write --set-default   # apply it
gmc migrate scopes --json                            # machine-readable report
```

## `gmc migrate scopes`

Audits your Content API → Merchant API **auth** readiness, then optionally migrates a legacy Content API config into a `gmc` profile.

| Option | Description |
|--------|-------------|
| `--from <path>` | Legacy Content API `merchant-info.json` to import |
| `--set-default` | Make the migrated profile the default |
| `--write` | Write the migrated profile to `config.json` (otherwise dry-run) |

The target profile name is the active profile (`-p, --profile`, default `default`); the merchant id comes from `--from` or `-a, --account`.

### The scope, in one line

The Merchant API uses the **same OAuth scope** as the Content API — `https://www.googleapis.com/auth/content`. Your existing tokens keep working; **no re-consent is required**. Google models per-sub-API scopes for the future, but they all resolve to that one scope today, so `gmc` is ready for granular scopes without any change on your side.

The real migration blockers aren't the scope — they're **enabling the Merchant API** on your Google Cloud project and **registering that project** as an API client. `migrate scopes` checks both (the same live probe behind [`gmc doctor`](/reference/doctor)), so a green run means you're genuinely ready, not just scope-compatible.

```
gmc migrate scopes — Content API → Merchant API

OAuth scope: unchanged. The Merchant API uses the same scope as the Content API:
  https://www.googleapis.com/auth/content
Existing tokens keep working — no re-consent is required today.

✓ Credential resolved — Authenticated as sa@proj.iam.gserviceaccount.com (project proj-1).
✓ Merchant API access — Merchant API reachable — 1 account(s) accessible.
```

The audit is **best-effort and non-fatal**: run it mid-migration before auth is wired up and an unresolved credential or unreachable API degrades to a `⚠`/`✗` line, never an aborted command. Use [`gmc doctor`](/reference/doctor) for the full diagnosis.

### Migrating a legacy config

If you bootstrapped from Google's [shopping samples](https://github.com/googleads/googleads-shopping-samples), you have a `merchant-info.json` holding your `merchantId`. Point `migrate scopes` at it to seed a `gmc` profile:

```sh
gmc -p mystore migrate scopes --from merchant-info.json --set-default --write
```

```
Config migration
  Created profile "mystore" → account 123456789.
  Set "mystore" as the default profile.
  Wrote ~/.config/gmc/config.json. Verify with `gmc doctor`.
```

Without `--write` it's a **dry-run** — it prints exactly what *would* change (`Would create…`) and touches nothing. With `--write` it creates or updates the profile, preserving every other profile and the existing default unless `--set-default` is given. Re-running once the profile already matches is a safe no-op. No `merchant-info.json`? Pass `-a <id>` instead of `--from`.

### `--json`

```json
{
  "audit": {
    "legacyScope": "https://www.googleapis.com/auth/content",
    "scopeUnchanged": true,
    "mapping": [ { "subApi": "products", "scopes": ["https://www.googleapis.com/auth/content"] } ],
    "checks": [ { "id": "credential", "title": "Credential resolved", "status": "pass", "detail": "…" } ],
    "ok": true
  },
  "plan": { "profileName": "mystore", "accountId": "123456789", "action": "create", "conflict": false, "setsDefault": true },
  "written": true
}
```

## Exit codes

`migrate scopes` is an **assistant, not a CI gate** — audit findings are advisory, so a reachability warning or a failing probe still exits `0`. Only real errors fail: `2` usage (a non-numeric `--account`, an unreadable `--from`, or a legacy file with no valid `merchantId`) · `4` config (writing an invalid profile).

## Coming next

- **`gmc migrate products`** (v0.9.7) — convert Content API v2.1 product JSON to Merchant API [ProductInput](/reference/products) files: price `{value,currency}` → `{amountMicros,currencyCode}`, attribute hoisting, and identifier/`targetCountry` → `feedLabel` remapping. Output drops straight into [`feeds push`](/reference/feeds) and [`preflight`](/reference/preflight).
- **`gmc migrate feed-labels`** (v0.9.8) — verify feed labels transfer correctly, so Shopping campaigns keep serving.
