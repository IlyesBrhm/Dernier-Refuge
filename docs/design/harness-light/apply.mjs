#!/usr/bin/env node
// À lancer À LA MAIN (le harness est protégé contre Claude) depuis la racine du projet :
//   node docs/design/harness-light/apply.mjs
// Installe la version allégée du harness, lance l'autotest, puis supprime ce dossier si tout est vert.
import { cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..", "..", "..");
const claude = path.join(project, ".claude");

const files = [
  ["settings.json", "settings.json"],
  ["hooks/policy.json", "hooks/policy.json"],
  ["hooks/test-gate.mjs", "hooks/test-gate.mjs"],
  ["hooks/selftest.mjs", "hooks/selftest.mjs"],
  ...["core-dev", "render-dev", "balance-designer", "save-guardian", "test-writer"].map((a) => [`agents/${a}.md`, `agents/${a}.md`]),
];
for (const [from, to] of files) {
  cpSync(path.join(here, from), path.join(claude, to));
  console.log(`installé : .claude/${to}`);
}

const r = spawnSync("node", [path.join(claude, "hooks", "selftest.mjs")], { stdio: "inherit", env: { ...process.env, CLAUDE_PROJECT_DIR: project } });
if (r.status !== 0) {
  console.error("\nAutotest en échec : dossier docs/design/harness-light conservé pour diagnostic.");
  process.exit(1);
}
rmSync(here, { recursive: true, force: true });
console.log("\nHarness allégé installé. Redémarre Claude Code (ou /hooks) pour recharger settings.json et les agents.");
