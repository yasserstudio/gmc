---
description: "GMC's August 2026 Google Merchant API compatibility baseline, API changes, migration deadlines, product-data requirements, and policy updates."
---

# Google Merchant updates — August 2026

This release candidate was checked against Google's live Merchant API discovery documents at
revision **`20260826`** and the official release notes available on August 30, 2026. It does not add
`v1alpha`-only surfaces unless Google promoted them to stable `v1`.

## API changes covered

- **Loyalty Customers is GA.** The new `loyaltyCustomers/v1` API has one privacy-preserving
  `manage` operation; GMC exposes it as [`gmc loyalty-customers manage`](/reference/loyalty-customers).
- **Products:** `productInputs.patch`, unpadded base64url product names, plural `gtins`, video links,
  handling cutoff times, minimum order values, loyalty shipping labels, offer-level returns, and the
  May 2026 conversational attributes are represented by the typed client.
- **Inventories:** local and regional writes now use Google's nested `localInventoryAttributes` /
  `regionalInventoryAttributes` wire shape. Older flattened GMC JSON remains accepted and is
  normalized, including legacy enum spellings.
- **Accounts and quota:** account filters, direct/indirect access selection, sub-account listing,
  isolated test-account creation, and the new account product-limit endpoints are available.
- **Data sources:** deprecated `primaryDataSourceName` default-rule references are normalized to
  `self: true`; product-review and merchant-review source types are recognized.

Google's [latest updates](https://developers.google.com/merchant/api/latest-updates),
[Products release notes](https://developers.google.com/merchant/api/release-notes/rest/products),
[Inventories release notes](https://developers.google.com/merchant/api/release-notes/rest/inventories),
and [Loyalty Customers release notes](https://developers.google.com/merchant/api/release-notes/rest/loyaltycustomers)
are the source of truth.

## Deadlines and operational changes

| Date         | Change                                                                                                                               | GMC impact                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Aug 18, 2026 | The Content API for Shopping was retired.                                                                                            | Use [`gmc migrate`](/reference/migrate) and Merchant API `v1`; GMC does not call Content API endpoints.     |
| Aug 24, 2026 | Merchant Center performance reporting separated YouTube affiliate traffic and changed historical reporting.                          | Expect report totals/categories to differ across the change boundary; no request-schema change is required. |
| Sep 30, 2026 | Pickup cost and minimum order values become required where applicable for in-store pickup in the UK, Switzerland, and EEA countries. | Supply the applicable pickup/minimum-order fields and check Merchant Center “Needs attention.”              |
| Jan 31, 2027 | Product images must be at least 500×500 px across categories and marketing methods.                                                  | Warnings are already active; replace undersized source images before enforcement.                           |

See Google's [Content API sunset notice](https://support.google.com/merchants/answer/16493611?hl=en),
[2026 product-data specification update](https://support.google.com/merchants/answer/16989427?hl=en),
[performance reporting change](https://support.google.com/merchants/answer/17103877?hl=en), and
[pickup requirement](https://support.google.com/merchants/answer/17036057?hl=en).

## Policy organization

Google is consolidating Shopping ads and free-listings policy pages in September 2026. Google says
this is an organizational change rather than a new restriction; continue following the existing
content, editorial, landing-page, and prohibited-product requirements. See the
[official consolidation notice](https://support.google.com/merchants/answer/17263064?hl=en).

::: warning Closed beta and alpha features
Real-estate product attributes remain a closed beta, while YouTube affiliate analytics, Product
Studio, Reviews, and other `v1alpha` surfaces can change without stable-version guarantees. GMC
keeps these outside the stable command surface for now.
:::
