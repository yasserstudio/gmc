---
"@gmc-cli/cli": patch
"@gmc-cli/api": patch
"@gmc-cli/auth": patch
---

Add `gmc ordertracking` (Order Tracking sub-API, `ordertracking/v1`) — submit order tracking signals so Google can show accurate delivery estimates. The sub-API is write-only: `gmc ordertracking create --file <signal.json>` (or stdin) posts an `OrderTrackingSignal`; there is no get/list/update/delete (signals are immutable once created). Reads required fields (orderId, shippingInfo, lineItems) and validates them offline before the call, strips the output-only `orderTrackingSignalId`, and supports `--merchant-id` to attribute a signal on behalf of another business. This is the last remaining GA (v1) Merchant API sub-API, completing the v1 surface.
