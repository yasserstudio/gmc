---
description: "Manage Merchant Center customer loyalty-tier associations through the stable Loyalty Customers v1 API without exposing membership lookup."
---

# gmc loyalty-customers

Manage customer loyalty-program tier associations with Google's stable `loyaltyCustomers/v1` API.
The shorter `gmc loyalty` alias is equivalent.

```sh
gmc loyalty-customers manage --file customer.json
cat customer.json | gmc loyalty-customers manage
```

```json
{
  "userIdentifier": { "emailAddress": "member@example.com" },
  "loyaltyTier": "TIER3",
  "pointBalance": "900"
}
```

`userIdentifier` needs at least one email address, E.164 phone number, or physical address.
`loyaltyTier` accepts `TIER1` through `TIER7`; send `NON_MEMBER` to remove an existing association.
The optional `pointBalance` is an int64 JSON string. The input may be a bare `LoyaltyCustomer` as
above or the API wrapper `{ "loyaltyCustomer": { ... } }`.

::: warning Customer data
Use `--file` or stdin; the command deliberately has no email/phone flags, so identifiers do not land
in shell history. Restrict input-file permissions and do not commit customer data. Human output never
echoes an identifier. `--json` returns Google's raw response and may contain submitted fields, so
treat it as sensitive too.
:::

## Privacy behavior

Google exposes no get/list operation. To prevent membership discovery, `manage` returns `200 OK`
with a default customer response when an identifier cannot be matched or the user has not opted into
personalization. GMC therefore reports that the request was accepted, not that a person was matched.

## Exit codes

`2` for missing/invalid account, identifier, tier, point balance, or JSON · `3` auth · `5` Merchant API.
