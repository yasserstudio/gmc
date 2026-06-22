import type { Rule } from "../types.js";
import { text, quote, SPEC, EDITORIAL_DOC } from "./_util.js";

const TITLE_MIN = 30;
const DESC_MIN = 500;

const PLACEHOLDER_IMAGE_RE =
  /\b(placeholder|no[_-]?image|default[_-]?image|coming[_-]?soon|temp)\b/i;

export const seoRules: Rule[] = [
  {
    id: "seo.title-length",
    title: "Title is in the optimal length range for Google Shopping",
    defaultSeverity: "info",
    check(product) {
      const t = text(product.productAttributes?.title);
      if (t === undefined || t.length >= TITLE_MIN) return [];
      return [
        {
          attribute: "title",
          message: `Title is only ${t.length} characters — titles under ${TITLE_MIN} characters often lack key product details that help with search ranking.`,
          suggestion: `Add key attributes (brand, color, size, material) to reach at least ${TITLE_MIN} characters.`,
          documentation: EDITORIAL_DOC,
        },
      ];
    },
  },
  {
    id: "seo.title-brand",
    title: "Brand name appears in the product title",
    defaultSeverity: "info",
    check(product) {
      const t = text(product.productAttributes?.title);
      const brand = text(product.productAttributes?.brand);
      if (t === undefined || brand === undefined) return [];
      if (t.toLowerCase().includes(brand.toLowerCase())) return [];
      return [
        {
          attribute: "title",
          message: `Title does not contain the brand "${quote(brand)}" — branded titles rank higher in Shopping results.`,
          suggestion: `Include "${quote(brand)}" near the start of the title.`,
          documentation: EDITORIAL_DOC,
        },
      ];
    },
  },
  {
    id: "seo.title-attributes",
    title: "Title includes differentiating attributes",
    defaultSeverity: "info",
    check(product) {
      const t = text(product.productAttributes?.title);
      if (t === undefined) return [];
      const attrs = product.productAttributes;
      if (!attrs) return [];
      const missing: string[] = [];
      const color = text(attrs.color);
      if (color && !t.toLowerCase().includes(color.toLowerCase())) missing.push("color");
      const size = text(attrs.size);
      if (size && !t.toLowerCase().includes(size.toLowerCase())) missing.push("size");
      if (missing.length === 0) return [];
      return [
        {
          attribute: "title",
          message: `Title is missing ${missing.join(" and ")} — including differentiating attributes in the title improves relevance.`,
          suggestion: `Add ${missing.join(" and ")} to the title (e.g. "${quote(t)} — ${missing.map((k) => (k === "color" ? color : size)).join(", ")}").`,
          documentation: EDITORIAL_DOC,
        },
      ];
    },
  },
  {
    id: "seo.description-length",
    title: "Description is in the optimal length range",
    defaultSeverity: "info",
    check(product) {
      const d = text(product.productAttributes?.description);
      if (d === undefined || d.length >= DESC_MIN) return [];
      return [
        {
          attribute: "description",
          message: `Description is only ${d.length} characters — descriptions under ${DESC_MIN} characters may miss long-tail search queries.`,
          suggestion: `Expand the description with materials, use cases, dimensions, and unique selling points to reach at least ${DESC_MIN} characters.`,
          documentation: SPEC,
        },
      ];
    },
  },
  {
    id: "seo.title-equals-description",
    title: "Title and description are not identical",
    defaultSeverity: "info",
    check(product) {
      const t = text(product.productAttributes?.title);
      const d = text(product.productAttributes?.description);
      if (t === undefined || d === undefined) return [];
      if (t.toLowerCase() !== d.toLowerCase()) return [];
      return [
        {
          attribute: "description",
          message:
            "Description is identical to the title — this wastes the description's SEO value.",
          suggestion:
            "Write a unique description that expands on the title with details, benefits, and keywords not already in the title.",
          documentation: SPEC,
        },
      ];
    },
  },
  {
    id: "seo.description-has-brand",
    title: "Description mentions the brand",
    defaultSeverity: "info",
    check(product) {
      const d = text(product.productAttributes?.description);
      const brand = text(product.productAttributes?.brand);
      if (d === undefined || brand === undefined) return [];
      if (d.toLowerCase().includes(brand.toLowerCase())) return [];
      return [
        {
          attribute: "description",
          message: `Description does not mention the brand "${quote(brand)}" — including the brand in the description reinforces relevance.`,
          suggestion: `Mention "${quote(brand)}" naturally in the product description.`,
          documentation: EDITORIAL_DOC,
        },
      ];
    },
  },
  {
    id: "seo.image-placeholder",
    title: "Image URL is not a placeholder",
    defaultSeverity: "info",
    check(product) {
      const img = text(product.productAttributes?.imageLink);
      if (img === undefined) return [];
      const match = PLACEHOLDER_IMAGE_RE.exec(img);
      if (!match) return [];
      return [
        {
          attribute: "imageLink",
          message: `Image URL contains "${quote(match[0])}" — placeholder images hurt click-through rate and may be disapproved.`,
          suggestion:
            "Replace with a high-quality product image that shows the item clearly on a clean background.",
          documentation: SPEC,
        },
      ];
    },
  },
];
