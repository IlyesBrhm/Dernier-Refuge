// Migrations de format (docs/design/save.md §3.6).
//
// `migrations[n]` transforme un état BRUT de la version n en état brut de la version n+1. Fonction pure
// sur `unknown`, sans validation interne : la validation (forme stricte + invariants) se fait APRÈS la
// dernière étape, sur la forme courante. Une migration ne doit jamais « réparer » un état invalide.
//
// Procédure quand `GameState` change de forme :
//   1. CURRENT_VERSION++ (config.ts) ;
//   2. ajouter `migrations[N-1]` ici ;
//   3. adapter le schéma (schema.ts) à la nouvelle forme ;
//   4. ajouter la fixture `tests/save/fixtures/vN-*.json` ; les fixtures précédentes restent et doivent
//      toujours se charger (via la chaîne de migrations).
// SALT et hash64 ne changent jamais.

import { CURRENT_VERSION } from "./config";
import { migrateV1toV2 } from "./migrate-v1";

export type Migration = (raw: unknown) => unknown;
export type MigrationRegistry = Readonly<Record<number, Migration>>;

/** Registre officiel : migrations[n] = vN → vN+1. */
export const migrations: MigrationRegistry = Object.freeze({
  1: migrateV1toV2, // jour/nuit : fire, night, sleeping, tuile F (docs/design/day-night.md §2.2)
});

export type MigrateResult = { ok: true; raw: unknown } | { ok: false; details: string[] };

/** Applique `registry[from]`, `registry[from+1]`… jusqu'à `target`. Ne lève jamais. */
export function migrate(
  raw: unknown,
  from: number,
  opts: { registry?: MigrationRegistry; target?: number } = {},
): MigrateResult {
  const registry = opts.registry ?? migrations;
  const target = opts.target ?? CURRENT_VERSION;
  if (!Number.isSafeInteger(from) || from < 1 || from > target) {
    return { ok: false, details: [`version source ${from} hors de [1, ${target}]`] };
  }
  let cur = raw;
  for (let v = from; v < target; v++) {
    const step = Object.hasOwn(registry, v) ? registry[v] : undefined;
    if (typeof step !== "function") return { ok: false, details: [`migration v${v} → v${v + 1} manquante`] };
    try {
      cur = step(cur);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, details: [`migration v${v} → v${v + 1} a échoué : ${msg}`] };
    }
  }
  return { ok: true, raw: cur };
}
