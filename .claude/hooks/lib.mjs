// Utilitaires partagés par les hooks. Aucune dépendance externe (Node >= 20).
import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

/** Entrée JSON du hook. null si illisible (le garde bloque alors : fail-closed). */
export function readStdinJson() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

export function projectDir(input = {}) {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
}

export function loadPolicy(root) {
  return JSON.parse(readFileSync(path.join(root, ".claude", "hooks", "policy.json"), "utf8"));
}

/** Chemin relatif au projet, en slashes. null si hors du projet. */
export function relToProject(root, filePath) {
  if (!filePath) return null;
  const abs = path.resolve(root, filePath);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return rel === "" ? "" : null;
  return rel.split(path.sep).join("/");
}

/** Glob minimal : ** (n'importe quoi, y compris /), * (sans /), ? (un caractère). Insensible à la casse (Windows). */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

export const matchesAny = (rel, globs = []) => globs.some((g) => globToRegExp(g).test(rel));

/** Nom de l'agent courant : --agent <nom> (hook de frontmatter) > agent_type (entrée du hook) > "main". */
export function currentAgent(input) {
  const i = process.argv.indexOf("--agent");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return input.agent_type || "main";
}

export function audit(root, entry) {
  try {
    const dir = path.join(root, ".claude", "logs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, "audit.jsonl"), JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    /* le log ne doit jamais casser un hook */
  }
}

/** Bloque l'action : exit 2 => Claude Code refuse l'outil et montre la raison à Claude. */
export function block(reason) {
  process.stderr.write(`[harness] BLOQUÉ : ${reason}\n`);
  process.exit(2);
}
