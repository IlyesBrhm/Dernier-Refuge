// Scénario « partie en cours » pour la capture camp-3d-midgame-*.png (pas un fichier de test).
// Construit avec le core uniquement (seed fixe, joueur piloté par commandes `setMoveInput` + `tick`,
// invariants vérifiés à chaque tick), puis encodé avec src/save : la page l'importe par le menu.
// Partagé par Playwright (tests/e2e/captures.spec.ts) et Vitest (tests/e2e/midgame-scenario.test.ts).
// Aucune dépendance à Vitest ni à Playwright ici (pas d'`expect`) : erreurs = exceptions explicites.

import { NODES, RESOURCES } from "../../src/data/balance";
import { applyCommand } from "../../src/core/commands";
import { checkInvariants } from "../../src/core/invariants";
import { sameTile, tileOf } from "../../src/core/map";
import { createInitialState, type GameState, type ResourceNode, type TilePos } from "../../src/core/state";
import { tick } from "../../src/core/tick";
import { exportSave } from "../../src/save/index";
import { steer } from "../core/helpers";

/** Seed fixe de la capture. */
export const MIDGAME_SEED = 7;
/** Ticks de récolte restants dans la sauvegarde exportée (la barre de l'arbre est presque pleine). */
export const MIDGAME_FINISH_TICKS = 8;
/** Horodatage fixe de la sauvegarde (informatif, jamais lu par le gameplay) : texte exporté reproductible. */
export const MIDGAME_SAVED_AT = Date.UTC(2026, 0, 1);

/** Arbre récolté devant la caméra : (4,9), le plus proche de la file (portrait : ~5 tuiles de large). */
const FINAL_TREE: TilePos = { tx: 4, ty: 9 };
/** Case de récolte de FINAL_TREE, côté file d'attente. */
const FINAL_SPOT: TilePos = { tx: 5, ty: 9 };

export interface MidgameScenario {
  seed: number;
  /** État exporté (récolte de FINAL_TREE à MIDGAME_FINISH_TICKS ticks de la fin, entrée 0,0). */
  state: GameState;
  /** Texte de sauvegarde (exportSave) à importer dans la page. */
  saveText: string;
  /** Ticks (sans aucune commande) avant que le bois n'augmente : fin de la récolte + ramassage. */
  finishInTicks: number;
  woodBefore: number;
  woodAfter: number;
  /** État simulé au tick où le bois augmente (même core, mêmes entrées : la page doit y arriver). */
  atFinish: GameState;
}

function nodeAt(s: GameState, t: TilePos): ResourceNode {
  const n = s.nodes.find((x) => sameTile(x.tile, t));
  if (!n) throw new Error(`aucun nœud en (${t.tx},${t.ty})`);
  return n;
}

/** Pilote : uniquement des commandes validées + tick ; invariants vérifiés après chaque tick. */
class Driver {
  s: GameState;
  constructor(seed: number) {
    this.s = createInitialState(seed);
  }

  input(dx: number, dy: number): void {
    if (dx === this.s.player.input.dx && dy === this.s.player.input.dy) return;
    const r = applyCommand(this.s, { type: "setMoveInput", dx, dy });
    if (!r.ok) throw new Error(`setMoveInput(${dx},${dy}) refusée au tick ${this.s.tick} : ${r.error}`);
    this.s = r.state;
  }

  step(): void {
    this.s = tick(this.s);
    const v = checkInvariants(this.s);
    if (v.length > 0) throw new Error(`invariants violés au tick ${this.s.tick} : ${v.join(" ; ")}`);
  }

  /** Rejoint chaque étape (tuile) dans l'ordre puis s'arrête (entrée 0,0). */
  walk(waypoints: readonly TilePos[], max = 400): void {
    for (const target of waypoints) {
      let i = 0;
      for (;;) {
        const want = steer(this.s, target);
        this.input(want.dx, want.dy);
        if (sameTile(tileOf(this.s.player.pos), target)) break;
        if (++i > max) throw new Error(`(${target.tx},${target.ty}) non atteinte en ${max} ticks (tick ${this.s.tick})`);
        this.step();
      }
    }
    this.input(0, 0);
  }

  waitUntil(label: string, pred: (s: GameState) => boolean, max = 1500): void {
    for (let i = 0; !pred(this.s); i++) {
      if (i >= max) throw new Error(`scénario : « ${label} » non atteint en ${max} ticks (tick ${this.s.tick})`);
      this.step();
    }
  }
}

const T = (tx: number, ty: number): TilePos => ({ tx, ty });

/**
 * Déroulé (carte de src/data/balance.ts, étapes choisies pour ne jamais passer sur un emplacement
 * de construction ni à portée de l'arbre final avant la dernière étape) :
 * 1. récolte l'arbre (14,1) puis l'arbre (2,9) : 10 + 3 + 3 = 16 bois ;
 * 2. construit l'emplacement B0 (7,2) (15 bois) ⇒ 2 tentes ;
 * 3. sur W : accueille le survivant A (tente 1) ; s'écarte ; revient quand A a entamé son repos et
 *    accueille B (tente B0) ⇒ B finira son repos bien après A ;
 * 4. attend le départ de A (tente 1 en désordre, B toujours au repos), la file se remplit (aucune tente libre) ;
 * 5. va en (5,9) et récolte l'arbre (4,9) jusqu'à harvestTicks − MIDGAME_FINISH_TICKS.
 */
export function buildMidgameScenario(seed = MIDGAME_SEED, finishTicks = MIDGAME_FINISH_TICKS): MidgameScenario {
  const d = new Driver(seed);
  const finalTreeId = nodeAt(d.s, FINAL_TREE).id;
  const finalProgress = () => nodeAt(d.s, FINAL_TREE).progress;

  // 1. Bois : arbres (14,1) et (2,9).
  d.walk([T(8, 6), T(10, 3), T(13, 3), T(13, 1)]);
  d.waitUntil("arbre (14,1) récolté", (s) => nodeAt(s, T(14, 1)).status === "depleted");
  d.walk([T(13, 3), T(10, 3), T(7, 6), T(2, 6), T(1, 7), T(1, 9)]);
  d.waitUntil("arbre (2,9) récolté", (s) => nodeAt(s, T(2, 9)).status === "depleted");
  const slot = d.s.buildSlots.find((b) => sameTile(b.tile, T(7, 2)));
  if (!slot) throw new Error("emplacement B0 introuvable");
  if (d.s.resources.wood < slot.cost) throw new Error(`bois insuffisant pour B0 : ${d.s.resources.wood} < ${slot.cost}`);

  // 2. Construction de B0.
  d.walk([T(1, 6), T(7, 3), T(7, 2)]);
  d.waitUntil("B0 construit", (s) => s.buildSlots.some((b) => b.id === slot.id && b.builtTentId !== null));
  const builtTentId = d.s.buildSlots.find((b) => b.id === slot.id)?.builtTentId ?? null;
  const firstTentId = d.s.tents[0]?.id;

  // 3. Accueil de A (tente libre d'id minimal = tente initiale), puis de B (tente B0) plus tard.
  d.walk([T(7, 3), T(7, 6), T(7, 9)]);
  d.waitUntil("A accueilli", (s) => s.tents.some((t) => t.id === firstTentId && t.status === "assigned"));
  const aId = d.s.tents.find((t) => t.id === firstTentId)?.occupantId;
  d.walk([T(8, 8)]);
  d.waitUntil("A au repos depuis ~25 ticks", (s) => {
    const a = s.survivors.find((v) => v.id === aId);
    return a?.status === "resting" && a.restTicksLeft <= 125;
  });
  d.walk([T(7, 9)]);
  d.waitUntil("B accueilli", (s) => s.tents.some((t) => t.id === builtTentId && t.status === "assigned"));
  d.walk([T(8, 8)]);

  // 4. Départ de A : tente 1 en désordre.
  d.waitUntil("tente initiale en désordre", (s) => s.tents.some((t) => t.id === firstTentId && t.status === "messy"));

  // 5. Récolte presque terminée de l'arbre final.
  if (finalProgress() !== 0) throw new Error(`l'arbre final a déjà progressé : ${finalProgress()}`);
  d.walk([T(6, 9), FINAL_SPOT]);
  const target = NODES.tree.harvestTicks - finishTicks;
  d.waitUntil(`progression de l'arbre final = ${target}`, () => finalProgress() >= target, 100);
  if (finalProgress() !== target) throw new Error(`progression ${finalProgress()} ≠ ${target}`);

  const state = d.s;
  const problems = midgameProblems(state);
  if (problems.length > 0) throw new Error(`scénario (seed ${seed}) incomplet : ${problems.join(" ; ")}`);

  // Simulation de ce que fera la page (aucune commande) : seul changement de bois = la récolte.
  let s = state;
  let finishInTicks = -1;
  let atFinish = state;
  for (let i = 1; i <= finishTicks + 10; i++) {
    const next = tick(s);
    if (next.resources.wood !== s.resources.wood) {
      if (finishInTicks !== -1) throw new Error(`le bois change une seconde fois au tick +${i}`);
      finishInTicks = i;
      atFinish = next;
      const tree = next.nodes.find((n) => n.id === finalTreeId);
      if (tree?.status !== "depleted") throw new Error(`le bois change au tick +${i} sans que l'arbre final soit récolté`);
    }
    s = next;
  }
  if (finishInTicks === -1) throw new Error("la récolte ne se termine pas");
  const after = midgameProblems(atFinish, false);
  if (after.length > 0) throw new Error(`à la fin de la récolte : ${after.join(" ; ")}`);

  const enc = exportSave(state, { seed, savedAt: MIDGAME_SAVED_AT });
  if (!enc.ok) throw new Error(`exportSave refusé : ${enc.error} ${enc.details.join(" ; ")}`);
  return {
    seed,
    state,
    saveText: enc.text,
    finishInTicks,
    woodBefore: state.resources.wood,
    woodAfter: atFinish.resources.wood,
    atFinish,
  };
}

/**
 * Ce que la capture doit montrer ; liste vide = OK. `harvesting` : l'arbre final doit encore être
 * prêt avec une récolte entamée (état exporté) ; sinon il vient d'être récolté.
 */
export function midgameProblems(s: GameState, harvesting = true): string[] {
  const out: string[] = [];
  if (s.tents.length < 2) out.push(`${s.tents.length} tente(s) < 2`);
  const occupied = s.tents.find((t) => t.status === "occupied");
  if (!occupied) out.push("aucune tente occupée");
  else {
    const occ = s.survivors.find((v) => v.id === occupied.occupantId);
    if (occ?.status !== "resting") out.push("occupant de la tente occupée pas au repos");
    // Marge : il doit rester au repos pendant toute la phase « page » (fin de récolte + vol du butin).
    else if (occ.restTicksLeft < 15) out.push(`repos presque fini (${occ.restTicksLeft} ticks)`);
  }
  if (!s.tents.some((t) => t.status === "messy")) out.push("aucune tente en désordre");
  if (s.queue.length < 2) out.push(`file de ${s.queue.length} survivant(s) < 2`);
  if (s.resources.wood >= RESOURCES.cap || s.resources.food >= RESOURCES.cap) out.push("stock plein");
  const tree = s.nodes.find((n) => sameTile(n.tile, FINAL_TREE));
  if (harvesting) {
    if (tree?.status !== "ready" || tree.progress <= 0) out.push("arbre final pas en cours de récolte");
    if (s.player.input.dx !== 0 || s.player.input.dy !== 0) out.push("joueur en mouvement");
    if (!sameTile(tileOf(s.player.pos), FINAL_SPOT)) out.push("joueur hors de la case de récolte");
  } else if (tree?.status !== "depleted") out.push("arbre final pas récolté");
  return out;
}
