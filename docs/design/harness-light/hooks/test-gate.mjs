#!/usr/bin/env node
// Stop (session principale uniquement) : si du code a été modifié depuis le dernier passage vert,
// lance typecheck + tests. En cas d'échec, empêche Claude de s'arrêter et lui donne l'erreur.
// Version allégée : plus de barrière à chaque fin de subagent, et le lint n'y est plus
// (il reste dans `npm run check` et dans la revue).
import { existsSync, readFileSync, statSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readStdinJson, projectDir, audit } from "./lib.mjs";

const input = readStdinJson() ?? {};
const root = projectDir(input);
const dirty = path.join(root, ".claude", "state", "dirty");

if (!existsSync(dirty)) process.exit(0);
if (input.stop_hook_active) process.exit(0); // évite une boucle infinie : un seul retour forcé
// Date de modification de `dirty` avant les vérifications : si du code change pendant
// qu'elles tournent, `dirty` est réécrit et ne doit pas être effacé.
const dirtyStamp = (() => {
  try {
    return statSync(dirty).mtimeMs;
  } catch {
    return null;
  }
})();
if (dirtyStamp === null) process.exit(0); // effacé entre-temps par une autre exécution
if (!existsSync(path.join(root, "node_modules"))) {
  process.stderr.write("[harness] node_modules absent : lance `npm install` pour activer la barrière de tests.\n");
  process.exit(0);
}

const run = (script) =>
  spawnSync("npm", ["run", script, "--silent"], { cwd: root, encoding: "utf8", shell: true, timeout: 150_000 });

const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts ?? {};
for (const script of ["typecheck", "test"].filter((s) => s in scripts)) {
  const r = run(script);
  if (r.status !== 0) {
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
    audit(root, { hook: "test-gate", event: input.hook_event_name, agent: input.agent_type, script, ok: false });
    process.stderr.write(`[harness] \`npm run ${script}\` échoue — corrige avant de terminer :\n${out}\n`);
    process.exit(2);
  }
}

// Ne pas planter si une autre exécution a déjà effacé `dirty` (ENOENT), et ne pas l'effacer s'il a été modifié depuis.
try {
  if (statSync(dirty).mtimeMs === dirtyStamp) rmSync(dirty, { force: true });
} catch {
  /* déjà effacé par une autre exécution : rien à faire */
}
audit(root, { hook: "test-gate", event: input.hook_event_name, agent: input.agent_type, ok: true });
process.exit(0);
