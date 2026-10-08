#!/usr/bin/env node
// PostToolUse (Write|Edit) : garantit que src/core reste PURE et DÉTERMINISTE.
// Le cœur du jeu ne doit dépendre ni du navigateur, ni de l'horloge, ni du hasard non seedé :
// c'est ce qui le rend testable, rejouable, et vérifiable (anti-triche).
// Marque aussi le projet comme "sale" pour que le hook Stop relance les tests.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { readStdinJson, projectDir, relToProject, audit } from "./lib.mjs";

const input = readStdinJson() ?? {};
const root = projectDir(input);
const ti = input.tool_input ?? {};
const rel = relToProject(root, ti.file_path ?? ti.notebook_path);
if (!rel) process.exit(0);

if (/^(src|tests)\//.test(rel)) {
  const stateDir = path.join(root, ".claude", "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(path.join(stateDir, "dirty"), rel);
}

if (!/^src\/core\/.*\.(ts|js)$/.test(rel)) process.exit(0);

const FORBIDDEN = [
  [/\bdocument\b|\bwindow\b|\bnavigator\b/, "API DOM/navigateur (le rendu va dans src/render ou src/ui)"],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, "stockage (la persistance va dans src/save)"],
  [/Math\.random\s*\(/, "Math.random() — utiliser le RNG seedé du state (src/core/rng.ts)"],
  [/Date\.now\s*\(|new Date\s*\(|performance\.now\s*\(/, "horloge réelle — le temps du jeu vient des ticks passés en paramètre"],
  [/requestAnimationFrame|setTimeout|setInterval/, "timers — la boucle de jeu vit dans src/app"],
  [/from\s+["'][^"']*\/(render|ui|app|save)\b/, "import d'une couche supérieure — core ne dépend de rien"],
  [/from\s+["']three(\/[^"']*)?["']/, "three.js — le 3D appartient à src/render ; le core manipule des nombres (tuiles, unités)"],
  [/\bconsole\.log\b/, "console.log laissé dans le core"],
];

let src = "";
try {
  src = readFileSync(path.join(root, rel), "utf8");
} catch {
  process.exit(0);
}
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const problems = FORBIDDEN.filter(([re]) => re.test(code)).map(([, msg]) => `  - ${msg}`);

if (problems.length) {
  audit(root, { hook: "core-purity", file: rel, problems });
  process.stderr.write(`[harness] ${rel} viole la pureté du core :\n${problems.join("\n")}\nCorrige avant de continuer.\n`);
  process.exit(2);
}
process.exit(0);
