# gmc promotions

**Manage Merchant Center promotions** — discounts and offers (e.g. "20% off", "free shipping")
applied to your products. Like products, a promotion is inserted under a (promotion) data source and
then processed. The API supports **list / get / insert** (insert is an upsert; there's no delete —
promotions expire).

```sh
gmc promotions list
gmc promotions get PROMO1
gmc promotions insert --data-source 98765 --file promo.json
gmc promotions list --json
```

## Commands

| Command | Description |
|---------|-------------|
| `gmc promotions list [--page-size <n>]` | List promotions for the account |
| `gmc promotions get <promotionId>` | Fetch one promotion (id or resource name from `list`) |
| `gmc promotions insert --data-source <id> [--file <path>]` | Insert (create or replace) a promotion from JSON |

`insert` reads the `Promotion` JSON from `--file` or stdin and requires `--data-source` (a promotion
data source — create one with [`gmc datasources create`](/reference/datasources)). A promotion needs
at least `promotionId`, `contentLanguage`, `targetCountry`, the redemption channel(s), and its
`attributes` (offer type, value, effective window). Processing is async — `get` reflects it after a
few minutes.

```json
{
  "promotionId": "PROMO1",
  "contentLanguage": "en",
  "targetCountry": "US",
  "redemptionChannel": ["ONLINE"],
  "attributes": {
    "productApplicability": "ALL_PRODUCTS",
    "offerType": "GENERIC_CODE_REQUIRED",
    "longTitle": "20% off all orders",
    "couponValueType": "PERCENT_OFF",
    "percentOff": "20",
    "genericRedemptionCode": "SAVE20",
    "promotionEffectiveTimePeriod": { "startTime": "2026-07-01T00:00:00Z", "endTime": "2026-07-31T23:59:59Z" }
  }
}
```

## Output

`list` prints `id · title · type`; `get` shows the promotion's detail; `--json` emits the raw API
result (`{ "promotions": [...] }` for list, the resource for get/insert).

## Exit codes

`0` success · `2` usage (missing `--data-source`, unreadable `--file`, non-object JSON) · `3` auth ·
`5` Merchant API.
