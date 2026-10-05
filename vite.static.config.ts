// Static export of the public website for traditional hosting (Hostinger).
//
//   npm run build:static   →  dist/client  (upload / deploy this folder)
//
// Only the public website pages are prerendered; the private portal is not
// part of the static output. The supplier form posts to the PHP handler in
// deploy/hostinger/api/ (see scripts/finalize-static.mjs).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const PAGES = [
  "/",
  "/about",
  "/trading-sectors",
  "/international-sourcing",
  "/wholesale-procurement",
  "/become-a-supplier",
  "/contact",
  "/privacy-policy",
  "/terms-and-conditions",
];

export default defineConfig({
  nitro: false,
  vite: { preview: { host: "127.0.0.1" } },
  tanstackStart: {
    server: { entry: "server" },
    prerender: {
      enabled: true,
      autoStaticPathsDiscovery: false,
      crawlLinks: false,
      autoSubfolderIndex: true,
      failOnError: true,
    },
    pages: PAGES.map((path) => ({ path })),
  },
});
