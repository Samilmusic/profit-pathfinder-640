// Copies Hostinger-specific files (.htaccess, PHP form handler, 404 page)
// into the static export and removes the unused server bundle.
import { cpSync, existsSync, rmSync } from "node:fs";

const out = "dist/client";
if (!existsSync(`${out}/index.html`)) {
  console.error("Static export missing — run the prerender build first.");
  process.exit(1);
}
cpSync("deploy/hostinger", out, { recursive: true });
rmSync("dist/server", { recursive: true, force: true });
console.log(`Static site ready in ${out}/`);
