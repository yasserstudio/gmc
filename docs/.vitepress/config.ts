import { defineConfig } from "vitepress";

// Project site under https://yasserstudio.github.io/gmc/ — hence base "/gmc/".
export default defineConfig({
  // `title` is the homepage <title> and the suffix on every page title — the GMC brand
  // plus keywords (the bare "gmc" alone collides with unrelated brands in search). Brand
  // text is "GMC"; the lowercase "gmc" is reserved for the command itself.
  title: "GMC — Google Merchant Center CLI",
  description:
    "GMC — the Google Merchant Center CLI: typed, CI-friendly access to the Google Merchant API, with an offline feed-compliance preflight and a Content API → Merchant API migrator.",
  base: "/gmc/",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: "https://yasserstudio.github.io/gmc/" },
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/gmc/icon-200.png" }],
    ["meta", { name: "theme-color", content: "#1a73e8" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "GMC — Google Merchant Center CLI" }],
    ["meta", { property: "og:image", content: "https://yasserstudio.github.io/gmc/og-card.jpg" }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { property: "og:image:alt", content: "GMC — The Google Merchant Center CLI" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:image", content: "https://yasserstudio.github.io/gmc/og-card.jpg" }],
  ],
  // Per-page canonical + Open Graph (title/url/description) and a SoftwareApplication
  // JSON-LD on the homepage. Title/description fall back to the page title and the
  // frontmatter `description` (set per page; the site `description` is the default).
  transformPageData(pageData) {
    const base = "https://yasserstudio.github.io/gmc";
    const slug = pageData.relativePath.replace(/(?:index)?\.md$/, "").replace(/\/$/, "");
    const url = slug ? `${base}/${slug}/` : `${base}/`;
    const isHome = pageData.relativePath === "index.md";
    const title =
      isHome || !pageData.title
        ? "GMC — Google Merchant Center CLI"
        : `${pageData.title} | GMC — Google Merchant Center CLI`;
    const description = pageData.frontmatter.description ?? pageData.description;
    const head = (pageData.frontmatter.head ??= []);
    head.push(
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { name: "twitter:title", content: title }],
    );
    if (description) {
      head.push(
        ["meta", { property: "og:description", content: description }],
        ["meta", { name: "twitter:description", content: description }],
      );
    }
    if (isHome) {
      head.push([
        "script",
        { type: "application/ld+json" },
        JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "SoftwareApplication",
              name: "GMC — Google Merchant Center CLI",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Linux, macOS, Windows",
              description:
                "Free, open-source CLI for the Google Merchant API: typed, CI-friendly access with an offline feed-compliance preflight and a Content API → Merchant API migrator.",
              url: `${base}/`,
              license: "https://opensource.org/licenses/MIT",
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              author: {
                "@type": "Organization",
                name: "Yasser Studio",
                url: "https://yasser.studio",
              },
              codeRepository: "https://github.com/yasserstudio/gmc",
            },
            { "@type": "WebSite", name: "GMC", url: `${base}/` },
          ],
        }),
      ]);
    }
  },
  themeConfig: {
    logo: "/icon-200.png",
    // Brand text in the navbar is "GMC"; the lowercase "gmc" is the command.
    siteTitle: "GMC",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/" },
      { text: "Devlog", link: "/devlog/" },
      {
        text: "v1.x",
        items: [
          { text: "Changelog", link: "https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md" },
          { text: "Roadmap", link: "/guide/roadmap" },
        ],
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "What is GMC?", link: "/guide/" },
            { text: "Installation", link: "/guide/installation" },
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Authentication", link: "/guide/authentication" },
            { text: "Configuration & profiles", link: "/guide/configuration" },
            { text: "GitHub Action (CI)", link: "/guide/github-action" },
            { text: "GitLab CI", link: "/guide/gitlab-ci" },
            { text: "Roadmap", link: "/guide/roadmap" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "CLI Reference",
          items: [
            { text: "Overview", link: "/reference/" },
            { text: "gmc doctor", link: "/reference/doctor" },
            { text: "gmc auth", link: "/reference/auth" },
            { text: "gmc config", link: "/reference/config" },
            { text: "gmc accounts", link: "/reference/accounts" },
            { text: "gmc products", link: "/reference/products" },
            { text: "gmc datasources", link: "/reference/datasources" },
            { text: "gmc feeds", link: "/reference/feeds" },
            { text: "gmc inventory", link: "/reference/inventory" },
            { text: "gmc promotions", link: "/reference/promotions" },
            { text: "gmc regions", link: "/reference/regions" },
            { text: "gmc notifications", link: "/reference/notifications" },
            { text: "gmc quota", link: "/reference/quota" },
            { text: "gmc issues", link: "/reference/issues" },
            { text: "gmc reports", link: "/reference/reports" },
            { text: "gmc conversions", link: "/reference/conversions" },
            { text: "gmc lfp", link: "/reference/lfp" },
            { text: "gmc preflight", link: "/reference/preflight" },
            { text: "gmc migrate", link: "/reference/migrate" },
          ],
        },
      ],
      "/devlog/": [
        {
          text: "Devlog",
          items: [
            { text: "All posts", link: "/devlog/" },
            { text: "The Phase 2 spike", link: "/devlog/2026-06-08-phase-2-spike" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/yasserstudio/gmc" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/yasserstudio/gmc/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "© 2026 Yasser Studio",
    },
  },
});
