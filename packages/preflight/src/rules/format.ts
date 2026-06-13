// Format rules: an attribute is *present* but malformed. These are the second half
// of what the Merchant API would reject — bad URLs, non-numeric prices, currencies
// or enums it doesn't recognize, GTIN check-digit failures, over-length text.
//
// Every format rule fires only when its attribute is present: a wholly-absent value
// is the matching `required.*` rule's job, so a missing title yields one finding
// (required.title), never two. Attribute values are read through `text()` (so a
// non-string from a hand-edited file is coerced, not thrown on) and echoed through
// `quote()` (so an untrusted value can't bloat or corrupt the report).

import type { Rule } from "../types.js";
import { text, quote, isHttpUrl, parseMicros, SPEC, IDENTIFIER_DOC } from "./_util.js";
import { isValidGtin } from "./gtin.js";

/** Canonical Merchant API enum values. */
const AVAILABILITY = new Set(["in_stock", "out_of_stock", "preorder", "backorder"]);
const CONDITION = new Set(["new", "refurbished", "used"]);

/** Length caps Merchant Center applies before truncating. */
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;

/** Lowercase + collapse spaces to underscores, so "In Stock" matches "in_stock". */
function normalizeEnum(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export const formatRules: Rule[] = [
  {
    id: "format.link-url",
    title: "Link is a valid URL",
    defaultSeverity: "error",
    check(product) {
      const link = text(product.productAttributes?.link);
      if (link === undefined || isHttpUrl(link)) return [];
      return [
        {
          attribute: "link",
          message: `Link "${quote(link)}" is not a valid http(s) URL.`,
          suggestion: "Use an absolute URL beginning with http:// or https://.",
          documentation: SPEC,
        },
      ];
    },
  },
  {
    id: "format.image-link-url",
    title: "Image link is a valid URL",
    defaultSeverity: "error",
    check(product) {
      const image = text(product.productAttributes?.imageLink);
      if (image === undefined || isHttpUrl(image)) return [];
      return [
        {
          attribute: "imageLink",
          message: `Image link "${quote(image)}" is not a valid http(s) URL.`,
          suggestion: "Use an absolute image URL beginning with http:// or https://.",
          documentation: SPEC,
        },
      ];
    },
  },
  {
    id: "format.price-amount",
    title: "Price amount is well-formed",
    defaultSeverity: "error",
    check(product) {
      const parsed = parseMicros(product.productAttributes?.price?.amountMicros);
      if (parsed.kind !== "invalid") return [];
      return [
        {
          attribute: "price.amountMicros",
          message: `Price amount "${quote(parsed.raw)}" is not a non-negative integer number of micros.`,
          suggestion:
            'Set amountMicros to an integer count of micros (1 unit = 1,000,000), e.g. "49990000" for 49.99.',
          documentation: SPEC,
        },
      ];
    },
  },
  {
    id: "format.price-currency",
    title: "Price currency is well-formed",
    defaultSeverity: "error",
    check(product) {
      const price = product.productAttributes?.price;
      // Only check the currency once the amount itself is well-formed: an absent price
      // is required.price's job, and a malformed amount is format.price-amount's — so a
      // broken price yields one finding, not a pile-on about a price being rebuilt anyway.
      if (!price || parseMicros(price.amountMicros).kind !== "valid") return [];
      const code = text(price.currencyCode);
      if (code === undefined) {
        return [
          {
            attribute: "price.currencyCode",
            message: "Price has an amount but no currency code.",
            suggestion: 'Set price.currencyCode to a 3-letter currency code, e.g. "USD".',
            documentation: SPEC,
          },
        ];
      }
      if (!/^[A-Za-z]{3}$/.test(code)) {
        return [
          {
            attribute: "price.currencyCode",
            message: `Currency code "${quote(code)}" is not a 3-letter currency code.`,
            suggestion: 'Use a 3-letter ISO-4217 code, e.g. "USD", "EUR", "GBP".',
            documentation: SPEC,
          },
        ];
      }
      return [];
    },
  },
  {
    id: "format.availability-enum",
    title: "Availability is a recognized value",
    defaultSeverity: "error",
    check(product) {
      const value = text(product.productAttributes?.availability);
      if (value === undefined || AVAILABILITY.has(normalizeEnum(value))) return [];
      return [
        {
          attribute: "availability",
          message: `Availability "${quote(value)}" is not a recognized value.`,
          suggestion: "Use one of: in_stock, out_of_stock, preorder, backorder.",
          documentation: SPEC,
        },
      ];
    },
  },
  {
    // A present-but-unrecognized condition (a typo'd enum) is a hard error the API
    // rejects, whereas a *missing* condition is only required.condition's warning
    // (it's recommended, and defaults to "new") — hence the asymmetric severities.
    id: "format.condition-enum",
    title: "Condition is a recognized value",
    defaultSeverity: "error",
    check(product) {
      const value = text(product.productAttributes?.condition);
      if (value === undefined || CONDITION.has(normalizeEnum(value))) return [];
      return [
        {
          attribute: "condition",
          message: `Condition "${quote(value)}" is not a recognized value.`,
          suggestion: "Use one of: new, refurbished, used.",
          documentation: SPEC,
        },
      ];
    },
  },
  {
    id: "format.gtin-checksum",
    title: "GTIN check digit is valid",
    defaultSeverity: "warning",
    check(product) {
      const gtin = text(product.productAttributes?.gtin);
      if (gtin === undefined || isValidGtin(gtin)) return [];
      return [
        {
          attribute: "gtin",
          message: `GTIN "${quote(gtin)}" is not a valid GTIN-8/12/13/14 (wrong length or check digit).`,
          suggestion:
            "Verify the barcode: GTINs are 8, 12, 13, or 14 digits with a mod-10 check digit.",
          documentation: IDENTIFIER_DOC,
        },
      ];
    },
  },
  {
    id: "format.title-length",
    title: "Title within length limit",
    defaultSeverity: "warning",
    check(product) {
      const title = text(product.productAttributes?.title);
      if (title === undefined || title.length <= TITLE_MAX) return [];
      return [
        {
          attribute: "title",
          message: `Title is ${title.length} characters; Merchant Center truncates titles over ${TITLE_MAX}.`,
          suggestion: `Trim the title to ${TITLE_MAX} characters or fewer; move detail into the description.`,
          documentation: SPEC,
        },
      ];
    },
  },
  {
    id: "format.description-length",
    title: "Description within length limit",
    defaultSeverity: "warning",
    check(product) {
      const description = text(product.productAttributes?.description);
      if (description === undefined || description.length <= DESCRIPTION_MAX) return [];
      return [
        {
          attribute: "description",
          message: `Description is ${description.length} characters; Merchant Center truncates descriptions over ${DESCRIPTION_MAX}.`,
          suggestion: `Trim the description to ${DESCRIPTION_MAX} characters or fewer.`,
          documentation: SPEC,
        },
      ];
    },
  },
];
