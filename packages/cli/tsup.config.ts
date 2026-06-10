import { defineConfig } from "tsup";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // Bundle the @gmc-cli/* workspace packages into the output so the published
  // `@gmc-cli/cli` is self-contained: a global / npx install resolves no internal
  // packages at runtime (they aren't published), and the Bun-compiled binary and
  // Homebrew install both get one standalone file.
  noExternal: [/^@gmc-cli\//],
  // No source maps in the published package — they'd leak the TypeScript source and
  // bloat the tarball for no end-user benefit.
  sourcemap: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    "process.env.__GMC_VERSION": JSON.stringify(pkg.version),
  },
});
