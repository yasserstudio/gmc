import { defineConfig } from "vitepress";

// Project site under https://yasserstudio.github.io/gmc/ — hence base "/gmc/".
export default defineConfig({
  title: "gmc",
  description:
    "Typed, CI-friendly CLI for the Google Merchant API — with an offline feed-compliance preflight.",
  base: "/gmc/",
  cleanUrls: true,
  lastUpdated: true,
  head: [["meta", { name: "theme-color", content: "#1a73e8" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/" },
      { text: "Devlog", link: "/devlog/" },
      {
        text: "v0.7.0",
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
            { text: "What is gmc?", link: "/guide/" },
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Authentication", link: "/guide/authentication" },
            { text: "Configuration & profiles", link: "/guide/configuration" },
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
