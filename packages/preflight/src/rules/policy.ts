// Policy rules: editorial / disapproval triggers Google flags that aren't schema-
// deterministic — promotional text, gimmicky capitalization or symbols, contact info
// in the title, an insecure landing page. These are heuristic, so all default to
// `warning` except `policy.promotional-title` (a well-known hard disapproval) — users
// tune any of them in `.gmcpreflightrc`. Like format rules, each fires only when its
// attribute is present, and reads/echoes values through `text()` / `quote()`.

import type { Rule } from "../types.js";
import { text, quote, EDITORIAL_DOC, SPEC } from "./_util.js";

// Promotional phrases that almost never belong in a product name. Deliberately
// multi-word / high-precision (no bare "sale"/"discount"/"cheap") since this rule gates.
const PROMO_PHRASES = [
  "free shipping",
  "best price",
  "lowest price",
  "buy now",
  "order now",
  "limited time",
  "money back",
  "money-back",
  "free gift",
  "on sale",
  "while supplies last",
  "satisfaction guaranteed",
];
const PROMO_PHRASE_RE = new RegExp(`\\b(${PROMO_PHRASES.join("|")})\\b`, "i");
const PROMO_PERCENT_RE = /\b\d{1,3}\s*%\s*off\b|\bsave\s+\d{1,3}\s*%/i;

// Excessive-capitalization heuristic: enough letters to judge, and most of them upper.
// 0.7 clears acronym-heavy but legit titles ("ASUS ROG Laptop" ≈ 0.62).
const CAPS_MIN_LETTERS = 12;
const CAPS_RATIO = 0.7;

// Gimmicky symbols: a run of repeated punctuation, decorative glyphs, or any emoji
// (Unicode Extended_Pictographic).
const SYMBOL_RUN_RE = /[!?*]{2,}/;
const DECORATIVE_RE = /[★☆▶◀◆♦♥●※]/;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

// Formatted phone numbers, matched by explicit shape so spec/dimension triples
// ("100 200 3000 mm", "123 456 7890") don't trip: an intl `+` number, a parenthesized
// area code, or a dash/dot-grouped local number. Space-grouped bare digit runs are
// intentionally NOT treated as phones — they're far more often specs than contact info.
const PHONE_RE = new RegExp(
  [
    /\+\d{1,3}[\s.-]\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}/.source, // +1 415 555 2671
    /\(\d{3}\)\s?\d{3}[\s.-]?\d{4}/.source, // (800) 555-1212
    /\b\d{3}[.-]\d{3}[.-]\d{4}\b/.source, // 555-123-4567 / 555.123.4567
  ].join("|"),
);

export const policyRules: Rule[] = [
  {
    id: "policy.promotional-title",
    title: "No promotional text in title",
    defaultSeverity: "error",
    check(product) {
      const title = text(product.productAttributes?.title);
      if (title === undefined) return [];
      const match = PROMO_PHRASE_RE.exec(title) ?? PROMO_PERCENT_RE.exec(title);
      if (!match) return [];
      return [
        {
          attribute: "title",
          message: `Title contains promotional text "${quote(match[0])}" — Merchant Center disapproves promotional overlays in titles.`,
          suggestion:
            "Remove promotional phrases (shipping, price claims, sales) from the title; describe the product itself.",
          documentation: EDITORIAL_DOC,
        },
      ];
    },
  },
  {
    id: "policy.title-caps",
    title: "Title isn't excessively capitalized",
    defaultSeverity: "warning",
    check(product) {
      const title = text(product.productAttributes?.title);
      if (title === undefined) return [];
      // Count Unicode letters / uppercase letters so non-Latin scripts (Cyrillic, Greek,
      // …) are judged too; caseless scripts (CJK) have 0 uppercase and never trip.
      const letters = (title.match(/\p{L}/gu) ?? []).length;
      if (letters < CAPS_MIN_LETTERS) return [];
      const upper = (title.match(/\p{Lu}/gu) ?? []).length;
      if (upper / letters <= CAPS_RATIO) return [];
      return [
        {
          attribute: "title",
          message: "Title is mostly uppercase — Merchant Center flags gimmicky capitalization.",
          suggestion: "Use normal capitalization; reserve capitals for brand names and acronyms.",
          documentation: EDITORIAL_DOC,
        },
      ];
    },
  },
  {
    id: "policy.title-symbols",
    title: "No gimmicky symbols in title",
    defaultSeverity: "warning",
    check(product) {
      const title = text(product.productAttributes?.title);
      if (title === undefined) return [];
      if (!SYMBOL_RUN_RE.test(title) && !DECORATIVE_RE.test(title) && !EMOJI_RE.test(title)) {
        return [];
      }
      return [
        {
          attribute: "title",
          message:
            "Title contains gimmicky symbols or emoji — Merchant Center disapproves decorative characters in titles.",
          suggestion: "Remove emoji, repeated punctuation, and decorative symbols from the title.",
          documentation: EDITORIAL_DOC,
        },
      ];
    },
  },
  {
    id: "policy.phone-in-title",
    title: "No phone number in title",
    defaultSeverity: "warning",
    check(product) {
      const title = text(product.productAttributes?.title);
      if (title === undefined) return [];
      const match = PHONE_RE.exec(title);
      if (!match) return [];
      return [
        {
          attribute: "title",
          message: `Title appears to contain a phone number "${quote(match[0])}" — contact info isn't allowed in titles.`,
          suggestion: "Remove phone numbers and other contact details from the title.",
          documentation: EDITORIAL_DOC,
        },
      ];
    },
  },
  {
    id: "policy.link-https",
    title: "Landing page is served over https",
    defaultSeverity: "warning",
    check(product) {
      const link = text(product.productAttributes?.link);
      if (link === undefined) return [];
      let protocol: string;
      try {
        protocol = new URL(link).protocol;
      } catch {
        return []; // a malformed URL is format.link-url's finding, not this rule's
      }
      if (protocol !== "http:") return [];
      return [
        {
          attribute: "link",
          message:
            "Landing page uses http, not https — Merchant Center expects a secure (https) link.",
          suggestion: "Serve the product landing page over https.",
          // SPEC, not EDITORIAL_DOC: this is a link-attribute concern, not a title/editorial one.
          documentation: SPEC,
        },
      ];
    },
  },
];
