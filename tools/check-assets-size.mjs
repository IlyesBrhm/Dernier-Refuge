#!/usr/bin/env node
// npm run assets:size — vérifie (CI) que les modèles livrés dans public/assets/ ne dépassent pas
// maxShippedBytes (tools/shipped-assets.json, 4 Mo). Voir docs/design/render-3d.md §4.10.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "public", "assets");
const { maxShippedBytes } = JSON.parse(readFileSync(path.join(root, "tools", "shipped-assets.json"), "utf8"));

const size = (d) =>
  readdirSync(d, { withFileTypes: true }).reduce(
    (s, e) => s + (e.isDirectory() ? size(path.join(d, e.name)) : statSync(path.join(d, e.name)).size),
    0,
  );

const bytes = existsSync(dir) ? size(dir) : 0;
const mo = (b) => (b / 1024 / 1024).toFixed(2);
console.log(`public/assets/ : ${mo(bytes)} Mo (maximum ${mo(maxShippedBytes)} Mo)`);
if (bytes > maxShippedBytes) {
  console.error("✗ Trop lourd : retirer des modèles de tools/shipped-assets.json puis relancer npm run assets.");
  process.exit(1);
}
