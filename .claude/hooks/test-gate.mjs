#!/usr/bin/env node
// Stop / SubagentStop : si du code a été modifié depuis le dernier passage vert,
// lance typecheck + lint + tests (ceux définis dans package.json). En cas d'échec, empêche Claude de s'arrêter et lui donne l'erreur.
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readStdinJson, projectDir, audit } from "./lib.mjs";

const input = readStdinJson() ?? {};
const root = projectDir(input);
const dirty = path.join(root, ".claude", "state", "dirty");

if (!existsSync(dirty)) process.exit(0);
if (input.stop_hook_active) process.exit(0); // évite une boucle infinie : un seul retour forcé
if (!existsSync(path.join(root, "node_modules"))) {
  process.stderr.write("[harness] node_modules absent : lance `npm install` pour activer la barrière de tests.\n");
  process.exit(0);
}

const run = (script) =>
  spawnSync("npm", ["run", script, "--silent"], { cwd: root, encoding: "utf8", shell: true, timeout: 150_000 });

const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts ?? {};
for (const script of ["typecheck", "lint", "test"].filter((s) => s in scripts)) {
  const r = run(script);
  if (r.status !== 0) {
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
    audit(root, { hook: "test-gate", event: input.hook_event_name, agent: input.agent_type, script, ok: false });
    process.stderr.write(`[harness] \`npm run ${script}\` échoue — corrige avant de terminer :\n${out}\n`);
    process.exit(2);
  }
}

unlinkSync(dirty);
audit(root, { hook: "test-gate", event: input.hook_event_name, agent: input.agent_type, ok: true });
process.exit(0);
