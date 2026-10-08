#!/usr/bin/env node
// PreToolUse : garde-fou central. Appliqué à la session principale ET à chaque subagent.
// - Écritures : uniquement dans les dossiers autorisés pour l'agent, jamais dans les fichiers protégés ni hors projet.
// - Lectures : jamais les secrets.
// - Bash : liste noire globale + liste blanche stricte pour les subagents (pas de chaînage, pas de redirection).
import { readStdinJson, projectDir, loadPolicy, relToProject, matchesAny, currentAgent, audit, block } from "./lib.mjs";

const input = readStdinJson();
if (input === null) block("entrée du hook illisible — action refusée par sécurité");
const root = projectDir(input);
const policy = loadPolicy(root);
const agent = currentAgent(input);
const rules = policy.agents[agent] ?? policy.unknownAgent;
const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const READ_TOOLS = new Set(["Read", "Grep", "Glob"]);

function deny(reason) {
  audit(root, { hook: "guard", agent, tool, decision: "deny", reason, input: ti });
  block(`${reason} (agent: ${agent})`);
}

if (WRITE_TOOLS.has(tool)) {
  const target = ti.file_path ?? ti.notebook_path;
  const rel = relToProject(root, target);
  if (rel === null) deny(`écriture hors du projet interdite : ${target}`);
  if (matchesAny(rel, policy.protected)) deny(`fichier protégé (modifiable uniquement à la main) : ${rel}`);
  if (!matchesAny(rel, rules.write)) {
    deny(`cet agent ne peut écrire que dans [${rules.write.join(", ") || "rien"}] — refusé : ${rel}`);
  }
}

if (READ_TOOLS.has(tool)) {
  const target = ti.file_path ?? ti.path;
  const rel = relToProject(root, target);
  if (rel && matchesAny(rel, policy.unreadable)) deny(`lecture de secret interdite : ${rel}`);
}

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(ti.command ?? "").trim();
  for (const pattern of policy.bashDenyAll) {
    if (new RegExp(pattern, "i").test(cmd)) deny(`commande interdite (règle /${pattern}/) : ${cmd}`);
  }
  if (rules.bash !== "any-not-denied") {
    // Subagent : une seule commande simple, pas de chaînage ni de redirection pour contourner la liste blanche.
    const stripped = cmd.replace(/2>&1/g, "");
    if (/[;&|<>`]|\$\(/.test(stripped)) deny(`chaînage/redirection interdits pour un subagent : ${cmd}`);
    for (const pattern of policy.bashDenySubagents ?? []) {
      if (new RegExp(pattern, "i").test(stripped)) deny(`option interdite pour un subagent (règle /${pattern}/) : ${cmd}`);
    }
    const allowed = (rules.bash ?? []).some((p) => new RegExp(p, "i").test(stripped.trim()));
    if (!allowed) deny(`commande hors liste blanche de l'agent : ${cmd}`);
  }
}

if (tool === "WebFetch" || tool === "WebSearch") {
  if (agent !== "main" && agent !== "architect") deny("accès web réservé à la session principale et à l'architecte");
}

if (tool === "Agent" && agent !== "main") deny("un subagent ne peut pas lancer d'autres agents");

audit(root, { hook: "guard", agent, tool, decision: "allow" });
process.exit(0);
