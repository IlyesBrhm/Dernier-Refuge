#!/usr/bin/env node
// Auto-test du harness : `node .claude/hooks/selftest.mjs`
// Simule des appels d'outils et vérifie que les hooks autorisent/bloquent ce qu'il faut.
// À relancer après toute modification de policy.json ou des hooks.
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const P = path.resolve(hooksDir, "..", "..");
const env = { ...process.env, CLAUDE_PROJECT_DIR: P };
const f = (p) => path.join(P, p);
const W = (p) => ({ tool_name: "Write", tool_input: { file_path: f(p) } });
const B = (c) => ({ tool_name: "Bash", tool_input: { command: c } });

const cases = [
  ["allow", "main écrit src/core", W("src/core/a.ts")],
  ["deny", "main écrit un hook", { tool_name: "Edit", tool_input: { file_path: f(".claude/hooks/guard.mjs") } }],
  ["deny", "main écrit policy (chemin relatif)", { tool_name: "Write", tool_input: { file_path: ".claude/hooks/policy.json" } }],
  ["deny", "main écrit un agent", W(".claude/agents/core-dev.md")],
  ["deny", "main écrit hors projet", { tool_name: "Write", tool_input: { file_path: path.resolve(P, "..", "evil.txt") } }],
  ["deny", "main sort via ..", W("../evil.txt")],
  ["deny", "main lit .env", { tool_name: "Read", tool_input: { file_path: f(".env") } }],
  ["allow", "core-dev écrit src/core", W("src/core/state.ts"), "core-dev"],
  ["allow", "core-dev écrit tests/core", W("tests/core/x.test.ts"), "core-dev"],
  ["deny", "core-dev écrit src/render", W("src/render/x.ts"), "core-dev"],
  ["deny", "core-dev écrit src/data", W("src/data/balance.ts"), "core-dev"],
  ["allow", "render-dev (agent_type) écrit src/ui", { agent_type: "render-dev", ...W("src/ui/hud.ts") }],
  ["deny", "render-dev (agent_type) écrit src/core", { agent_type: "render-dev", ...W("src/core/x.ts") }],
  ["allow", "balance-designer écrit src/data", W("src/data/balance.ts"), "balance-designer"],
  ["deny", "balance-designer écrit src/core", W("src/core/x.ts"), "balance-designer"],
  ["allow", "save-guardian écrit src/save", W("src/save/slots.ts"), "save-guardian"],
  ["deny", "test-writer écrit src/", W("src/core/x.ts"), "test-writer"],
  ["deny", "reviewer écrit docs", W("docs/x.md"), "reviewer"],
  ["allow", "architect écrit docs/design", W("docs/design/x.md"), "architect"],
  ["deny", "architect lance Bash", B("npm test"), "architect"],
  ["deny", "agent non déclaré écrit", { agent_type: "general-purpose", ...W("src/a.ts") }],
  ["allow", "core-dev npm test", B("npm test"), "core-dev"],
  ["allow", "reviewer git diff", B("git diff --stat"), "reviewer"],
  ["deny", "reviewer git commit", B("git commit -m x"), "reviewer"],
  ["deny", "core-dev chaînage &&", B("npm test && rm x"), "core-dev"],
  ["deny", "core-dev redirection >", B("npm test > src/render/x.ts"), "core-dev"],
  ["deny", "core-dev $(...)", B("npx vitest $(cat x)"), "core-dev"],
  ["deny", "core-dev npm install", B("npm install lodash"), "core-dev"],
  ["allow", "render-dev npm run lint", B("npm run lint"), "render-dev"],
  ["allow", "test-writer npm run lint", B("npm run lint"), "test-writer"],
  ["allow", "balance-designer npm run typecheck", B("npm run typecheck"), "balance-designer"],
  ["allow", "balance-designer npm run lint", B("npm run lint"), "balance-designer"],
  ["allow", "save-guardian npx eslint src/save", B("npx eslint src/save"), "save-guardian"],
  ["deny", "render-dev lint --fix", B("npm run lint -- --fix"), "render-dev"],
  ["deny", "core-dev npx eslint --fix", B("npx eslint . --fix"), "core-dev"],
  ["deny", "architect npm run lint", B("npm run lint"), "architect"],
  ["deny", "render-dev écrit un asset généré", W("public/assets/nature/CommonTree_1.gltf"), "render-dev"],
  ["deny", "render-dev écrit le catalogue généré", W("src/render/assets/asset-catalog.ts"), "render-dev"],
  ["allow", "render-dev écrit le loader", W("src/render/assets/asset-loader.ts"), "render-dev"],
  ["deny", "main écrit une source d'asset", W("assets-src/nature-megakit/models/Pine_1.gltf")],
  ["allow", "render-dev npm run assets", B("npm run assets"), "render-dev"],
  ["deny", "core-dev npm run assets", B("npm run assets"), "core-dev"],
  ["deny", "main rm -rf", B("rm -rf src")],
  ["deny", "main git push", B("git push origin main")],
  ["deny", "main git reset --hard", B("git reset --hard HEAD~3")],
  ["deny", "main Remove-Item", { tool_name: "PowerShell", tool_input: { command: "Remove-Item -Recurse src" } }],
  ["deny", "main sed sur un hook", B("sed -i 's/x/y/' .claude/hooks/guard.mjs")],
  ["deny", "main curl", B("curl https://example.com")],
  ["allow", "main npm run dev", B("npm run dev")],
  ["deny", "subagent lance un Agent", { tool_name: "Agent", tool_input: {} }, "core-dev"],
  ["deny", "balance-designer WebFetch", { tool_name: "WebFetch", tool_input: {} }, "balance-designer"],
];

const guard = path.join(hooksDir, "guard.mjs");
let fails = 0;
const check = (ok, label) => {
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}`);
};

for (const [exp, label, input, agent] of cases) {
  const r = spawnSync("node", [guard, ...(agent ? ["--agent", agent] : [])], { input: JSON.stringify(input), encoding: "utf8", env });
  const got = r.status === 0 ? "allow" : r.status === 2 ? "deny" : `exit ${r.status}`;
  check(got === exp, `[${got}] ${label}`);
}
const bad = spawnSync("node", [guard], { input: "{pas du json", encoding: "utf8", env });
check(bad.status === 2, "[deny] entrée illisible (fail-closed)");

// Pureté du core
const tmp = f("src/core/__selftest_tmp.ts");
const purity = (code) => {
  writeFileSync(tmp, code);
  const r = spawnSync("node", [path.join(hooksDir, "core-purity.mjs")], { input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: tmp } }), encoding: "utf8", env });
  return r.status;
};
check(purity("export const r = () => Math.random();\n") === 2, "core-purity bloque Math.random");
check(purity('import { x } from "../render/draw";\n') === 2, "core-purity bloque un import de render");
check(purity('import * as THREE from "three";\n') === 2, "core-purity bloque three.js");
check(purity("export const ok = (n: number) => n + 1; // Math.random() en commentaire\n") === 0, "core-purity accepte du code pur");
rmSync(tmp, { force: true });
rmSync(f(".claude/state"), { recursive: true, force: true });

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nHarness OK : toutes les règles se comportent comme prévu.");
process.exit(fails ? 1 : 0);
