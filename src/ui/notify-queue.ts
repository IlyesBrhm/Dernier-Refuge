// File des toasts (docs/design/ui-polish.md §1.7). PURE, temps injecté (`advanceToasts(dtMs)`), aucune
// horloge ni DOM : testable sous node.
// - un seul toast visible ; file d'attente ≤ MAX_WAITING ;
// - priorité danger > warning > success > info ; un toast plus prioritaire en attente écourte le
//   courant dès qu'il a été vu MIN_SHOWN_MS ;
// - même `key` (affiché ou en attente) ⇒ texte / type mis à jour et durée relancée, pas de doublon ;
// - `fireOut` remplace un `fireLow` en attente ;
// - file pleine ⇒ le plus ancien de la priorité la plus basse est retiré ;
// - durée = 3 s (info, success), 5 s (warning), 6 s (danger) + 50 ms par caractère au-delà de 40, ≤ 8 s ;
//   gelée (pause, onglet caché) et prolongée (survol / focus) par l'appelant via `advanceToasts`.

export type ToastKind = "info" | "success" | "warning" | "danger";

export interface ToastInput {
  key: string;
  kind: ToastKind;
  text: string;
  /** Icône particulière (nom d'icône de src/ui/icons), sinon celle du type. */
  icon?: string;
}

export interface Toast extends ToastInput {
  id: number;
  /** Durée totale prévue (ms). */
  duration: number;
  /** Temps restant (ms). */
  remaining: number;
  /** Temps déjà affiché (ms), 0 en attente. */
  shown: number;
}

export interface ToastQueue {
  readonly current: Toast | null;
  /** En attente, ordre d'arrivée. */
  readonly waiting: readonly Toast[];
  readonly nextId: number;
}

export const MAX_WAITING = 4;
export const MIN_SHOWN_MS = 1000;
export const MAX_TOAST_MS = 8000;
const BASE_MS: Record<ToastKind, number> = { info: 3000, success: 3000, warning: 5000, danger: 6000 };
const PRIORITY: Record<ToastKind, number> = { info: 0, success: 1, warning: 2, danger: 3 };

/** Clés liées : une nouvelle `fireOut` retire une `fireLow` en attente. */
const SUPERSEDES: Readonly<Record<string, readonly string[]>> = { fireOut: ["fireLow"] };

export const EMPTY_TOASTS: ToastQueue = Object.freeze({ current: null, waiting: Object.freeze([]), nextId: 1 });

export function toastPriority(kind: ToastKind): number {
  return PRIORITY[kind];
}

export function toastDuration(kind: ToastKind, text: string): number {
  const extra = Math.max(0, [...text].length - 40) * 50;
  return Math.min(MAX_TOAST_MS, BASE_MS[kind] + extra);
}

/** Écourte le courant si un toast plus prioritaire attend (fin dès MIN_SHOWN_MS d'affichage). */
function preempt(q: ToastQueue): ToastQueue {
  const cur = q.current;
  if (!cur) return q;
  const top = q.waiting.reduce((m, t) => Math.max(m, PRIORITY[t.kind]), -1);
  if (top <= PRIORITY[cur.kind]) return q;
  const remaining = Math.min(cur.remaining, Math.max(0, MIN_SHOWN_MS - cur.shown));
  return remaining === cur.remaining ? q : { ...q, current: { ...cur, remaining } };
}

/** Index du prochain toast : plus haute priorité, puis le plus ancien. */
function nextIndex(waiting: readonly Toast[]): number {
  let best = -1;
  for (let i = 0; i < waiting.length; i++) {
    const t = waiting[i];
    const b = best >= 0 ? waiting[best] : undefined;
    if (t && (!b || PRIORITY[t.kind] > PRIORITY[b.kind])) best = i;
  }
  return best;
}

function promote(q: ToastQueue): ToastQueue {
  if (q.current || q.waiting.length === 0) return q;
  const i = nextIndex(q.waiting);
  const t = q.waiting[i];
  if (!t) return q;
  return { ...q, current: { ...t, shown: 0, remaining: t.duration }, waiting: q.waiting.filter((_, j) => j !== i) };
}

export function pushToast(q: ToastQueue, input: ToastInput): ToastQueue {
  const duration = toastDuration(input.kind, input.text);
  const fresh = (id: number): Toast => ({ ...input, id, duration, remaining: duration, shown: 0 });

  // Même clé déjà affichée : mise à jour + durée relancée.
  if (q.current && q.current.key === input.key) {
    const cur: Toast = { ...q.current, ...input, duration, remaining: duration };
    return preempt({ ...q, current: cur });
  }
  let waiting = q.waiting;
  const superseded = SUPERSEDES[input.key];
  if (superseded) waiting = waiting.filter((t) => !superseded.includes(t.key));

  const same = waiting.findIndex((t) => t.key === input.key);
  let nextId = q.nextId;
  if (same >= 0) {
    const old = waiting[same] as Toast;
    waiting = waiting.map((t, j) => (j === same ? { ...fresh(old.id) } : t));
  } else {
    waiting = [...waiting, fresh(nextId)];
    nextId++;
    while (waiting.length > MAX_WAITING) {
      // Retire le plus ancien de la priorité la plus basse.
      let low = 0;
      for (let i = 1; i < waiting.length; i++) {
        const a = waiting[i] as Toast;
        const b = waiting[low] as Toast;
        if (PRIORITY[a.kind] < PRIORITY[b.kind]) low = i;
      }
      waiting = waiting.filter((_, j) => j !== low);
    }
  }
  return preempt(promote({ current: q.current, waiting, nextId }));
}

export interface AdvanceOptions {
  /** Pause en jeu ou onglet caché : rien ne s'écoule. */
  frozen?: boolean;
  /** Survol / focus du toast : le temps d'affichage compte mais la fin est repoussée. */
  hold?: boolean;
}

export function advanceToasts(q: ToastQueue, dtMs: number, opts: AdvanceOptions = {}): ToastQueue {
  if (opts.frozen || !q.current || !(dtMs > 0)) return q;
  const cur = q.current;
  const shown = cur.shown + dtMs;
  const remaining = opts.hold ? Math.max(cur.remaining, 1) : cur.remaining - dtMs;
  if (remaining > 0) return preempt({ ...q, current: { ...cur, shown, remaining } });
  return preempt(promote({ ...q, current: null }));
}

/** Retire le toast courant (fermeture explicite) et promeut le suivant. */
export function dismissCurrent(q: ToastQueue): ToastQueue {
  if (!q.current) return q;
  return preempt(promote({ ...q, current: null }));
}
