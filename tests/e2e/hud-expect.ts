// Textes accessibles attendus du HUD (contrat `data-hud`, docs/design/ui-polish.md §1.8), dérivés de
// l'état par les sélecteurs du core. Pas un fichier de test : partagé par les scénarios e2e (Node) et
// leurs tests Vitest. Aucune dépendance à Vitest ni à Playwright.

import { FIRE, QUEUE, TIME } from "../../src/data/balance";
import {
  clockInfo,
  freeTentCount,
  isFireLow,
  isNight,
  queueLength,
  sleepersCount,
  welcomeBlockReason,
} from "../../src/core/selectors";
import type { GameState } from "../../src/core/state";
import { formatExact } from "../../src/ui/format";

export interface HudExpect {
  /** `[data-hud=clock]` aria-label : « Jour N, jour|nuit, X min avant la nuit|l'aube ». */
  clockLabel: string;
  /** Texte visible « Jour N » (version longue). */
  dayLabel: string;
  /** `[data-hud=fire]` : data-state, aria-valuenow, aria-valuetext, texte « w/16 ». */
  fireState: "ok" | "low" | "out";
  fireWood: number;
  fireValueText: string;
  fireText: string;
  /** `[data-hud=wood|food]` aria-label « Bois : 1 234 » (formatExact). */
  woodLabel: string;
  foodLabel: string;
  /** `[data-hud=queue]` data-state et aria-label. */
  queueState: "open" | "closed";
  queueLabel: string;
  /** `[data-hud=tents]` aria-label « Tentes libres : x sur y[, n dormeur(s)] ». */
  tentsLabel: string;
}

/** Minutes (arrondies au supérieur, au moins 1) avant la prochaine bascule jour/nuit. */
function minutesToSwitch(pos: number): { minutes: number; toNight: boolean } {
  const toNight = pos < TIME.dayTicks;
  const left = toNight ? TIME.dayTicks - pos : TIME.dayTicks + TIME.nightTicks - pos;
  return { minutes: Math.max(1, Math.ceil(left / (60 * TIME.ticksPerSecond))), toNight };
}

export function hudExpect(s: GameState): HudExpect {
  const c = clockInfo(s);
  const night = c.phase === "night";
  const sw = minutesToSwitch(c.cyclePos);
  const w = Math.max(0, s.fire.wood);
  const out = w <= 0;
  const low = isFireLow(s);
  const block = welcomeBlockReason(s);
  const why =
    block === "coldLeavers" ? ", accueil fermé jusqu'à l'aube" : block === "fireOut" ? ", accueil fermé tant que le feu est éteint" : "";
  const free = freeTentCount(s);
  const n = sleepersCount(s);
  return {
    clockLabel: `Jour ${c.day}, ${night ? "nuit" : "jour"}, ${sw.minutes} min avant ${sw.toNight ? "la nuit" : "l'aube"}`,
    dayLabel: `Jour ${c.day}`,
    fireState: out ? "out" : low ? "low" : "ok",
    fireWood: w,
    fireValueText: `${w} bois sur ${FIRE.capacity}${out ? ", éteint" : low ? ", faible" : ""}`,
    fireText: `${w}/${FIRE.capacity}`,
    woodLabel: `Bois : ${formatExact(s.resources.wood)}`,
    foodLabel: `Nourriture : ${formatExact(s.resources.food)}`,
    queueState: block !== null ? "closed" : "open",
    queueLabel: `File : ${queueLength(s)} sur ${QUEUE.maxLength}${why}`,
    tentsLabel: `Tentes libres : ${free} sur ${s.tents.length}${isNight(s.tick) ? `, ${n} ${n > 1 ? "dormeurs" : "dormeur"}` : ""}`,
  };
}
