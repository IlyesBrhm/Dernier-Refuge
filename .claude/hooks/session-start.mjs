#!/usr/bin/env node
// SessionStart : injecte un état du projet dans le contexte de Claude (stdout => contexte).
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readStdinJson, projectDir } from "./lib.mjs";

const root = projectDir(readStdinJson() ?? {});
const lines = ["## État du projet (hook SessionStart)"];

const git = spawnSync("git", ["status", "--short", "--branch"], { cwd: root, encoding: "utf8" });
lines.push(git.status === 0 ? "Git :\n" + git.stdout.trim() : "Git : dépôt non initialisé (`git init` recommandé).");
lines.push(existsSync(path.join(root, "node_modules")) ? "Dépendances : installées." : "Dépendances : NON installées → `npm install`.");
if (existsSync(path.join(root, ".claude", "state", "dirty"))) lines.push("⚠ Des modifications n'ont pas encore passé les tests.");

const roadmap = path.join(root, "docs", "ROADMAP.md");
if (existsSync(roadmap)) {
  const next = readFileSync(roadmap, "utf8").split("\n").filter((l) => /^\s*- \[ \]/.test(l)).slice(0, 5);
  if (next.length) lines.push("Prochaines tâches de la roadmap :\n" + next.join("\n"));
}
lines.push("Rappel : src/core est pur et déterministe ; toute mutation d'état passe par une commande validée.");
process.stdout.write(lines.join("\n\n") + "\n");
