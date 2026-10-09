#!/usr/bin/env node
// Teste la version allégée SANS toucher au harness du projet :
// bac à sable temporaire = hooks actuels (guard, lib, core-purity) + policy/selftest/test-gate préparés.
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..", "..", "..");
const box = mkdtempSync(path.join(os.tmpdir(), "harness-light-"));
const hooks = path.join(box, ".claude", "hooks");
mkdirSync(hooks, { recursive: true });
mkdirSync(path.join(box, "src", "core"), { recursive: true });
for (const f of ["guard.mjs", "lib.mjs", "core-purity.mjs"]) cpSync(path.join(project, ".claude", "hooks", f), path.join(hooks, f));
for (const f of ["policy.json", "selftest.mjs", "test-gate.mjs"]) cpSync(path.join(here, "hooks", f), path.join(hooks, f));
const r = spawnSync("node", [path.join(hooks, "selftest.mjs")], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: box } });
process.stdout.write(r.stdout + r.stderr);
rmSync(box, { recursive: true, force: true });
process.exit(r.status ?? 1);
