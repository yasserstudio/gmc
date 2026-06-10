// Required-attribute rules: a product missing one of these is rejected (or, for the
// recommended ones, degraded) by the Merchant API. v0.9.3 seeded the three most
// fundamental (offer id, title, price); v0.9.4 fills in the rest — description, link,
// image link, availability, condition, and the identifier-exists check.

import type { Rule } from "../types.js";
import { blank, parseMicros, SPEC, IDENTIFIER_DOC } from "./_util.js";

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
    id: "required.description",
    title: "Description present",
    defaultSeverity: "error",
    check(product) {
      if (blank(product.attributes?.description)) {
        return [
          {
            attribute: "description",
            message: "Missing description — every product must have a `description`.",
            suggestion: "Set attributes.description to the text shoppers see for the product.",
            documentation: SPEC,
          },
        ];
      }
      return [];
    },
  },
  {
    id: "required.link",
    title: "Link present",
    defaultSeverity: "error",
    check(product) {
      if (blank(product.attributes?.link)) {
        return [
          {
            attribute: "link",
            message: "Missing link — every product must have a landing-page `link`.",
            suggestion: "Set attributes.link to the product's landing page URL.",
            documentation: SPEC,
          },
        ];
      }
      return [];
    },
  },
  {
    id: "required.image-link",
    title: "Image link present",
    defaultSeverity: "error",
    check(product) {
      if (blank(product.attributes?.imageLink)) {
        return [
          {
            attribute: "imageLink",
            message: "Missing image link — every product must have an `image_link`.",
            suggestion: "Set attributes.imageLink to the main product image URL.",
            documentation: SPEC,
          },
        ];
      }
      return [];
    },
  },
  {
    id: "required.availability",
    title: "Availability present",
    defaultSeverity: "error",
    check(product) {
      if (blank(product.attributes?.availability)) {
        return [
          {
            attribute: "availability",
            message: "Missing availability — every product must declare `availability`.",
            suggestion:
              "Set attributes.availability to in_stock, out_of_stock, preorder, or backorder.",
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
      // Absent amount only — a present-but-malformed amount is format.price-amount's job.
      if (!price || parseMicros(price.amountMicros).kind === "absent") {
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
  {
    id: "required.condition",
    title: "Condition present",
    defaultSeverity: "warning",
    check(product) {
      if (blank(product.attributes?.condition)) {
        return [
          {
            attribute: "condition",
            message:
              "No condition set — recommended for all products and required for used/refurbished items.",
            suggestion: 'Set attributes.condition to "new", "refurbished", or "used".',
            documentation: SPEC,
          },
        ];
      }
      return [];
    },
  },
  {
    id: "required.identifier-exists",
    title: "Has a product identifier",
    defaultSeverity: "warning",
    check(product) {
      const a = product.attributes;
      if (blank(a?.gtin) && blank(a?.mpn) && blank(a?.brand)) {
        return [
          {
            message:
              "No product identifier — set at least one of gtin, mpn, or brand (most categories require one).",
            suggestion: "Add a gtin (barcode), or an mpn plus brand, per your product category.",
            documentation: IDENTIFIER_DOC,
          },
        ];
      }
      return [];
    },
  },
];
