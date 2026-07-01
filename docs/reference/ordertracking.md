# gmc ordertracking

**Submit order tracking signals** — shipment data Google uses to show accurate delivery
estimates (`ordertracking/v1` `accounts.orderTrackingSignals`). The sub-API is **write-only**:
you `create` a signal once an order is **completely shipped**. Signals are immutable — there is
**no get / list / update / delete**. The account comes from `--account` / `GMC_ACCOUNT_ID` / your
profile.

```sh
gmc ordertracking create --file signal.json
cat signal.json | gmc ordertracking create              # or pipe via stdin
gmc ordertracking create --file signal.json --merchant-id 555
```

## Commands

| Command                            | Description                                                     |
| ---------------------------------- | --------------------------------------------------------------- |
| `gmc ordertracking create [flags]` | Create an order tracking signal (write-only — cannot be undone) |

## Defining a signal

Pass a full `OrderTrackingSignal` JSON via `--file <path>` (or stdin). The output-only
`orderTrackingSignalId` is dropped if present, so a body saved from a create response re-applies.

| Flag                 | Sets                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `--file <path>`      | The `OrderTrackingSignal` JSON (else stdin)                                                         |
| `--merchant-id <id>` | `merchantId` — attribute the signal to another business (requires access; defaults to your account) |

**Required fields** (validated offline before the call, so a malformed signal fails fast):

| Field          | Meaning                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orderId`      | The order id on your side (hashed in the response)                                                                                                                                  |
| `shippingInfo` | Non-empty array — per shipment: `shipmentId`, `shippingStatus` (`SHIPPED`/`DELIVERED`), `originPostalCode`, `originRegionCode`, and a `trackingId`+`carrier` **or** a delivery-time |
| `lineItems`    | Non-empty array — per item: `lineItemId`, `productId`, `quantity`                                                                                                                   |

A minimal `signal.json`:

```json
{
  "orderCreatedTime": {
    "year": 2026,
    "month": 6,
    "day": 30,
    "timeZone": { "id": "America/Los_Angeles" }
  },
  "orderId": "order-abc",
  "shippingInfo": [
    {
      "shipmentId": "ship-1",
      "trackingId": "1Z999",
      "carrier": "UPS",
      "shippingStatus": "SHIPPED",
      "originPostalCode": "95016",
      "originRegionCode": "US"
    }
  ],
  "lineItems": [{ "lineItemId": "li-1", "productId": "online:en:US:sku1", "quantity": "2" }]
}
```

## Output

On success, prints `Created order tracking signal <id>.` and a summary line
(`N shipment(s) · M line item(s)`). `--json` emits the raw API result — the created signal, whose
`orderId` / `shipmentId`s are hashed and postal codes anonymized (so the summary reports counts
rather than echoing the hashed `orderId`).

## Exit codes

`0` success · `2` usage (no account, missing required fields — `orderId` / non-empty `shippingInfo` /
non-empty `lineItems`) · `3` auth · `5` Merchant API.
