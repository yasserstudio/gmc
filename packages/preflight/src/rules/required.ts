// Required-attribute rules: a product missing one of these is rejected outright by
// the Merchant API. v0.9.3 seeds the three most fundamental (offer id, title,
// price) to prove the engine end-to-end; v0.9.4 fills in the rest (description,
// link, image link, availability, condition, the identifier-exists rule).

import type { Rule } from "../types.js";

// Merchant Center product data specification (all attributes).
const SPEC = "https://support.google.com/merchants/answer/7052112";

/** Trim a possibly-undefined string; empty/whitespace counts as absent. */
function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

export const requiredRules: Rule[] = [
  {
    id: "required.offer-id",
    title: "Offer id present",
    defaultSeverity: "error",
    check(product) {
      if (blank(product.offerId)) {
        return [
          {
            attribute: "offerId",
            message: "Missing offer id — the unique product identifier (`id`).",
            suggestion: "Give every product a stable, unique offer id.",
            documentation: SPEC,
          },
        ];
      }
      return [];
    },
  },
  {
    id: "required.title",
    title: "Title present",
    defaultSeverity: "error",
    check(product) {
      if (blank(product.attributes?.title)) {
        return [
          {
            attribute: "title",
            message: "Missing title — every product must have a `title`.",
            suggestion: "Set attributes.title to the product's name as shown to shoppers.",
            documentation: SPEC,
          },
        ];
      }
      return [];
    },
  },
  {
    id: "required.price",
    title: "Price present",
    defaultSeverity: "error",
    check(product) {
      const price = product.attributes?.price;
      if (!price || blank(price.amountMicros)) {
        return [
          {
            attribute: "price",
            message: "Missing price — every product must have a `price` with an amount.",
            suggestion:
              'Set attributes.price.amountMicros (and currencyCode), e.g. 49990000 / "USD".',
            documentation: SPEC,
          },
        ];
      }
      return [];
    },
  },
];
