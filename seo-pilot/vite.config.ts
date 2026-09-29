import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// `shopify app dev` writes the live tunnel URL (and API key/secret) into a
// project-root .env file on every run. This app is also supposed to receive
// those as live environment variables from the CLI's own process, but that
// hand-off isn't reliable on every setup (seen failing on Windows) — so as
// a safety net, load the .env file directly here, before anything else in
// this app reads process.env. Values already set (e.g. by the CLI, or by a
// real shell env var) always win over the file.
const envPath = path.resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// The Shopify CLI hands the current tunnel URL to this process under one of
// two names depending on its version: the modern SHOPIFY_APP_URL, or the
// older HOST. Shopify's own template normalises HOST into SHOPIFY_APP_URL,
// and without this the app sees no URL at all and refuses to boot with
// "Detected an empty appUrl configuration".
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

declare module "@react-router/dev/vite" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  server: {
    port: Number(process.env.PORT || 3000),
    allowedHosts: true,
  },
  plugins: [reactRouter(), tsconfigPaths()],
  build: {
    assetsInlineLimit: 0,
  },
});
