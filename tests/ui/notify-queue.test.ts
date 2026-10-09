// File des toasts (src/ui/notify-queue.ts, docs/design/ui-polish.md §1.7). Pure, temps injecté.

import {
  advanceToasts,
  dismissCurrent,
  EMPTY_TOASTS,
  MAX_TOAST_MS,
  MAX_WAITING,
  MIN_SHOWN_MS,
  pushToast,
  toastDuration,
  toastPriority,
  type ToastInput,
  type ToastKind,
  type ToastQueue,
} from "../../src/ui/notify-queue";

const t = (key: string, kind: ToastKind = "info", text = key): ToastInput => ({ key, kind, text });

function pushAll(q: ToastQueue, ...inputs: ToastInput[]): ToastQueue {
  return inputs.reduce(pushToast, q);
}

/** Avance par pas de `step` ms et renvoie les clés affichées successivement (sans doublon consécutif). */
function playOut(q: ToastQueue, totalMs: number, step = 50): { q: ToastQueue; shown: string[] } {
  const shown: string[] = [];
  let cur = q;
  if (cur.current) shown.push(cur.current.key);
  for (let ms = 0; ms < totalMs; ms += step) {
    cur = advanceToasts(cur, step);
    const k = cur.current?.key;
    if (k !== undefined && shown.at(-1) !== k) shown.push(k);
  }
  return { q: cur, shown };
}

describe("durées", () => {
  it("3 s (info, success), 5 s (warning), 6 s (danger) jusqu'à 40 caractères", () => {
    const forty = "x".repeat(40);
    expect(toastDuration("info", forty)).toBe(3000);
    expect(toastDuration("success", forty)).toBe(3000);
    expect(toastDuration("warning", forty)).toBe(5000);
    expect(toastDuration("danger", forty)).toBe(6000);
  });

  it("+50 ms par caractère au-delà de 40, plafonné à 8 s", () => {
    expect(toastDuration("info", "x".repeat(41))).toBe(3050);
    expect(toastDuration("info", "x".repeat(100))).toBe(6000);
    expect(toastDuration("info", "x".repeat(140))).toBe(8000);
    expect(toastDuration("info", "x".repeat(5000))).toBe(MAX_TOAST_MS);
    expect(toastDuration("danger", "x".repeat(80))).toBe(MAX_TOAST_MS); // 6000 + 2000
    expect(MAX_TOAST_MS).toBe(8000);
  });

  it("les caractères sont comptés en points de code (accents, émoji)", () => {
    expect(toastDuration("info", "é".repeat(41))).toBe(3050);
    expect(toastDuration("info", "🔥".repeat(41))).toBe(3050);
  });

  it("un toast reste affiché exactement sa durée", () => {
    let q = pushToast(EMPTY_TOASTS, t("a", "warning"));
    q = advanceToasts(q, 4999);
    expect(q.current?.key).toBe("a");
    q = advanceToasts(q, 1);
    expect(q.current).toBeNull();
  });
});

describe("un seul toast visible, jamais de chevauchement", () => {
  it("le 2e attend la fin du 1er", () => {
    const q = pushAll(EMPTY_TOASTS, t("a"), t("b"));
    expect(q.current?.key).toBe("a");
    expect(q.waiting.map((w) => w.key)).toEqual(["b"]);
    const r = playOut(q, 7000);
    expect(r.shown).toEqual(["a", "b"]);
    expect(r.q.current).toBeNull();
    expect(r.q.waiting).toEqual([]);
  });

  it("à même priorité, ordre d'arrivée", () => {
    const q = pushAll(EMPTY_TOASTS, t("a"), t("b"), t("c"), t("d"));
    expect(playOut(q, 20_000).shown).toEqual(["a", "b", "c", "d"]);
  });

  it("en attente, la plus haute priorité passe d'abord (puis la plus ancienne)", () => {
    // Le courant est un danger (non écourté) ; puis info, warning, success, warning2 en attente.
    const q = pushAll(EMPTY_TOASTS, t("d", "danger"), t("i", "info"), t("w", "warning"), t("s", "success"), t("w2", "warning"));
    expect(playOut(q, 30_000).shown).toEqual(["d", "w", "w2", "s", "i"]);
  });
});

describe("priorité et écourtement", () => {
  it("ordre des priorités : danger > warning > success > info", () => {
    expect(toastPriority("danger")).toBeGreaterThan(toastPriority("warning"));
    expect(toastPriority("warning")).toBeGreaterThan(toastPriority("success"));
    expect(toastPriority("success")).toBeGreaterThan(toastPriority("info"));
  });

  it("un toast plus prioritaire écourte le courant, mais pas avant 1 s d'affichage", () => {
    let q = pushToast(EMPTY_TOASTS, t("info"));
    q = advanceToasts(q, 200);
    q = pushToast(q, t("alarm", "danger"));
    expect(q.current?.key).toBe("info");
    expect(q.current?.remaining).toBe(MIN_SHOWN_MS - 200);
    q = advanceToasts(q, MIN_SHOWN_MS - 200 - 1);
    expect(q.current?.key).toBe("info");
    q = advanceToasts(q, 1);
    expect(q.current?.key).toBe("alarm");
    expect(q.current?.shown).toBe(0);
    expect(q.current?.remaining).toBe(6000);
    // Le toast écourté ne revient pas.
    expect(playOut(q, 10_000).shown).toEqual(["alarm"]);
  });

  it("courant déjà vu ≥ 1 s : remplacé au pas suivant", () => {
    let q = pushToast(EMPTY_TOASTS, t("info"));
    q = advanceToasts(q, 2000);
    q = pushToast(q, t("alarm", "danger"));
    expect(q.current?.remaining).toBe(0);
    q = advanceToasts(q, 1);
    expect(q.current?.key).toBe("alarm");
  });

  it("un toast moins (ou aussi) prioritaire n'écourte pas le courant", () => {
    let q = pushToast(EMPTY_TOASTS, t("w", "warning"));
    q = advanceToasts(q, 100);
    const before = q.current?.remaining;
    q = pushAll(q, t("i", "info"), t("s", "success"), t("w2", "warning"));
    expect(q.current?.key).toBe("w");
    expect(q.current?.remaining).toBe(before);
  });
});

describe("dédoublonnage par clé", () => {
  it("même clé que le toast affiché ⇒ texte mis à jour, durée relancée, pas de doublon", () => {
    let q = pushToast(EMPTY_TOASTS, t("fireLow", "warning", "Le feu faiblit"));
    q = advanceToasts(q, 3000);
    const id = q.current?.id;
    q = pushToast(q, t("fireLow", "warning", "Le feu faiblit — 2 dormeurs risquent de partir"));
    expect(q.current?.id).toBe(id);
    expect(q.current?.text).toBe("Le feu faiblit — 2 dormeurs risquent de partir");
    expect(q.current?.remaining).toBe(q.current?.duration);
    expect(q.waiting).toEqual([]);
  });

  it("même clé qu'un toast en attente ⇒ mis à jour en place (position et id conservés)", () => {
    let q = pushAll(EMPTY_TOASTS, t("a"), t("b", "info", "v1"), t("c"));
    const nextId = q.nextId;
    q = pushToast(q, t("b", "info", "v2"));
    expect(q.waiting.map((w) => [w.key, w.text])).toEqual([
      ["b", "v2"],
      ["c", "c"],
    ]);
    expect(q.nextId).toBe(nextId);
  });

  it("clés toujours uniques entre le courant et la file", () => {
    let q = EMPTY_TOASTS;
    for (let i = 0; i < 50; i++) q = pushToast(q, t(`k${i % 3}`, (["info", "success", "warning", "danger"] as const)[i % 4]));
    const keys = [q.current?.key, ...q.waiting.map((w) => w.key)].filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("fireOut remplace fireLow", () => {
  it("fireLow en attente retiré par l'arrivée de fireOut", () => {
    let q = pushToast(EMPTY_TOASTS, t("coldLeavers", "danger")); // courant non écourtable
    q = pushToast(q, t("fireLow", "warning", "Le feu faiblit"));
    expect(q.waiting.map((w) => w.key)).toEqual(["fireLow"]);
    q = pushToast(q, t("fireOut", "danger", "Le feu est éteint — accueil suspendu"));
    expect(q.waiting.map((w) => w.key)).toEqual(["fireOut"]);
  });

  it("fireLow affiché : fireOut l'écourte (après 1 s) et fireLow ne revient pas", () => {
    let q = pushToast(EMPTY_TOASTS, t("fireLow", "warning"));
    q = pushToast(q, t("fireOut", "danger"));
    expect(playOut(q, 20_000).shown).toEqual(["fireLow", "fireOut"]);
  });
});

describe("file ≤ 4", () => {
  it("file pleine ⇒ le plus ancien de la priorité la plus basse est retiré", () => {
    let q = pushAll(EMPTY_TOASTS, t("cur", "danger"), t("w1", "warning"), t("i1"), t("i2"), t("s1", "success"));
    expect(q.waiting.map((w) => w.key)).toEqual(["w1", "i1", "i2", "s1"]);
    q = pushToast(q, t("d2", "danger"));
    expect(q.waiting.map((w) => w.key)).toEqual(["w1", "i2", "s1", "d2"]);
    expect(q.waiting).toHaveLength(MAX_WAITING);
  });

  it("file pleine de warnings : un info qui arrive est lui-même le moins prioritaire, donc retiré", () => {
    let q = pushAll(EMPTY_TOASTS, t("cur", "danger"), t("a", "warning"), t("b", "warning"), t("c", "warning"), t("d", "warning"));
    q = pushToast(q, t("e"));
    expect(q.waiting.map((w) => w.key)).toEqual(["a", "b", "c", "d"]);
    expect(MAX_WAITING).toBe(4);
  });
});

describe("gel, maintien, fermeture", () => {
  it("gelé (pause, onglet caché) : MÊME référence, rien ne s'écoule", () => {
    const q = pushToast(EMPTY_TOASTS, t("a"));
    expect(advanceToasts(q, 10_000, { frozen: true })).toBe(q);
    let r = q;
    for (let i = 0; i < 100; i++) r = advanceToasts(r, 1000, { frozen: true });
    expect(r.current?.remaining).toBe(3000);
  });

  it("dt nul, négatif ou NaN ⇒ même référence ; file vide ⇒ même référence", () => {
    const q = pushToast(EMPTY_TOASTS, t("a"));
    expect(advanceToasts(q, 0)).toBe(q);
    expect(advanceToasts(q, -50)).toBe(q);
    expect(advanceToasts(q, Number.NaN)).toBe(q);
    expect(advanceToasts(EMPTY_TOASTS, 100)).toBe(EMPTY_TOASTS);
  });

  it("survol / focus : le toast reste (fin repoussée), le temps d'affichage compte", () => {
    let q = pushToast(EMPTY_TOASTS, t("a"));
    for (let i = 0; i < 20; i++) q = advanceToasts(q, 1000, { hold: true });
    expect(q.current?.key).toBe("a");
    expect(q.current?.shown).toBe(20_000);
    q = advanceToasts(q, q.current?.remaining ?? 0);
    expect(q.current).toBeNull();
  });

  it("dismissCurrent retire le courant et promeut le suivant ; sans courant ⇒ même référence", () => {
    let q = pushAll(EMPTY_TOASTS, t("a"), t("b"));
    q = dismissCurrent(q);
    expect(q.current?.key).toBe("b");
    q = dismissCurrent(q);
    expect(q.current).toBeNull();
    expect(dismissCurrent(q)).toBe(q);
  });

  it("entrées jamais mutées (file gelée en profondeur)", () => {
    const deep = <T>(o: T): T => {
      if (o && typeof o === "object") {
        Object.freeze(o);
        for (const v of Object.values(o)) deep(v);
      }
      return o;
    };
    const q = deep(pushAll(EMPTY_TOASTS, t("a"), t("b", "danger"), t("c")));
    expect(() => {
      deep(pushToast(q, t("d", "warning")));
      deep(advanceToasts(q, 500));
      deep(dismissCurrent(q));
      deep(pushToast(q, t("a", "info", "maj")));
    }).not.toThrow();
  });
});

describe("marche aléatoire déterministe", () => {
  it("invariants : ≤ 1 courant, file ≤ 4, clés uniques, restant ≥ 0, ids uniques croissants", () => {
    let seed = 99;
    const rand = (n: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    const kinds: ToastKind[] = ["info", "success", "warning", "danger"];
    const keys = ["fireLow", "fireOut", "coldLeavers", "nightSoon", "tentBuilt", "fireRelit", "import", "export"];
    let q = EMPTY_TOASTS;
    for (let i = 0; i < 5000; i++) {
      const r = rand(10);
      if (r < 4) q = pushToast(q, t(keys[rand(keys.length)] as string, kinds[rand(4)] as ToastKind, "x".repeat(rand(120))));
      else if (r < 9) q = advanceToasts(q, rand(3000), { frozen: rand(5) === 0, hold: rand(7) === 0 });
      else q = dismissCurrent(q);
      expect(q.waiting.length).toBeLessThanOrEqual(MAX_WAITING);
      const all = [...(q.current ? [q.current] : []), ...q.waiting];
      expect(new Set(all.map((x) => x.key)).size).toBe(all.length);
      expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
      for (const x of all) {
        expect(x.id).toBeLessThan(q.nextId);
        expect(x.duration).toBeLessThanOrEqual(MAX_TOAST_MS);
      }
      if (q.current) expect(q.current.remaining).toBeGreaterThanOrEqual(0);
      // Pas de toast en attente alors que rien n'est affiché.
      if (!q.current) expect(q.waiting).toEqual([]);
    }
  });
});
