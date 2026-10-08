// Valeurs trafiquées puis RE-SIGNÉES (le tricheur a lu le code et recalcule le checksum) : complète
// codec.test.ts (qui couvre déjà bois 999 999 / -1, "NaN" en chaîne, ids en double drop↔survivant,
// champ manquant/en trop, slot cost: 1, rng -1 / 2^32, drop de 999 999 au tick 10).

import { createInitialState, type GameState } from "../../src/core/index";
import { STARTING_RESOURCES, PLAUSIBILITY, RESOURCES } from "../../src/data/balance";
import { decodeSave, encodeSave, type DecodeError, type DecodeResult } from "../../src/save/index";
import { midgame, resign, SAVED_AT, SEED } from "./helpers";

type Raw = Record<string, unknown>;
type S = Raw & {
  resources: Record<string, unknown>;
  drops: Raw[];
  survivors: Raw[];
  tents: Raw[];
  buildSlots: Raw[];
  nodes: Raw[];
  queue: unknown[];
};

function enc(s: GameState): string {
  const r = encodeSave(s, { seed: SEED, savedAt: SAVED_AT });
  if (!r.ok) throw new Error(r.error);
  return r.text;
}

function expectError(r: DecodeResult, error: DecodeError, detail?: RegExp): void {
  if (r.ok) throw new Error(`accepté alors que ${error} attendu`);
  expect(r.error, r.details.join("; ")).toBe(error);
  if (detail) expect(r.details.some((d) => detail.test(d)), r.details.join("; ")).toBe(true);
}

let MID: GameState;
let MID_TEXT: string;
let INIT_TEXT: string;
beforeAll(() => {
  MID = midgame();
  MID_TEXT = enc(MID);
  INIT_TEXT = enc(createInitialState(SEED));
});

describe("NaN / Infinity via le texte brut", () => {
  it("NaN littéral ⇒ not_json (pas du JSON), sans exception", () => {
    const t = MID_TEXT.replace(/"wood":\d+/, '"wood":NaN');
    expect(t).not.toBe(MID_TEXT);
    expectError(decodeSave(t), "not_json");
  });

  it("Infinity littéral / -Infinity ⇒ not_json", () => {
    expectError(decodeSave(MID_TEXT.replace(/"tick":\d+/, '"tick":Infinity')), "not_json");
    expectError(decodeSave(MID_TEXT.replace(/"tick":\d+/, '"tick":-Infinity')), "not_json");
  });

  it("1e999 (Infinity après parse) ne peut PAS être re-signé : le checksum est refusé", () => {
    // Le tricheur ne peut pas calculer de checksum canonique sur Infinity : quoi qu'il mette, bad_checksum.
    const t = resign(MID_TEXT, () => {}).replace(/"food":\d+/, '"food":1e999');
    expectError(decodeSave(t), "bad_checksum", /non sérialisable/);
  });

  it("nombre non sûr écrit en texte (2^53+1) ⇒ refusé sans exception", () => {
    const t = MID_TEXT.replace(/"tick":\d+/, '"tick":9007199254740993');
    expectError(decodeSave(t), "bad_checksum");
  });
});

describe("plausibilité (stock au plafond trop tôt)", () => {
  it("bois au plafond (9999) au tick 10 ⇒ invariants (plausibilité wood)", () => {
    const t = resign(INIT_TEXT, (st) => {
      st.tick = 10;
      (st as S).resources.wood = RESOURCES.cap;
    });
    expectError(decodeSave(t), "invariants", /plausibilité wood/);
  });

  it("nourriture au plafond au tick 10 ⇒ invariants (plausibilité food)", () => {
    const t = resign(INIT_TEXT, (st) => {
      st.tick = 10;
      (st as S).resources.food = RESOURCES.cap;
    });
    expectError(decodeSave(t), "invariants", /plausibilité food/);
  });

  it("borne exacte : départ + tick × taux accepté, +1 refusé (limite assumée, triche plausible tolérée)", () => {
    const at = (wood: number): string =>
      resign(INIT_TEXT, (st) => {
        st.tick = 10;
        (st as S).resources.wood = wood;
      });
    const max = STARTING_RESOURCES.wood + 10 * PLAUSIBILITY.woodPerTick;
    expect(decodeSave(at(max)).ok).toBe(true);
    expectError(decodeSave(at(max + 1)), "invariants", /plausibilité wood/);
  });

  it("tick ramené à 0 sur une partie avancée ⇒ invariants (plausibilité)", () => {
    const t = resign(MID_TEXT, (st) => void (st.tick = 0));
    expectError(decodeSave(t), "invariants", /plausibilité/);
  });

  it("tas au sol énorme en fin de partie (999 999 au tick courant) ⇒ invariants (plausibilité)", () => {
    const t = resign(MID_TEXT, (st) => {
      const d = (st as S).drops[0]!;
      d.amount = 999_999;
    });
    expectError(decodeSave(t), "invariants", /plausibilité/);
  });

  it("bois versé dans un chantier gonflé (paid = cost sans tente) ⇒ invariants", () => {
    const t = resign(MID_TEXT, (st) => {
      const b = (st as S).buildSlots.find((x) => x.builtTentId === null)!;
      b.paid = b.cost;
    });
    expectError(decodeSave(t), "invariants", /builtTentId incohérent/);
  });
});

describe("ressources", () => {
  it.each(["stone", "water", "coins", "food"])("%s négatif ⇒ invariants", (res) => {
    const t = resign(MID_TEXT, (st) => void ((st as S).resources[res] = -5));
    expectError(decodeSave(t), "invariants", new RegExp(`ressource ${res}`));
  });

  it("pièces au-delà du plafond ⇒ invariants", () => {
    const t = resign(MID_TEXT, (st) => void ((st as S).resources.coins = RESOURCES.cap + 1));
    expectError(decodeSave(t), "invariants", /ressource coins/);
  });

  it("montant de drop nul ou négatif ⇒ invariants", () => {
    for (const amount of [0, -3]) {
      const t = resign(MID_TEXT, (st) => void ((st as S).drops[0]!.amount = amount));
      expectError(decodeSave(t), "invariants", /montant invalide/);
    }
  });
});

describe("rng hors bornes / mal typé", () => {
  it.each([
    ["1.5", 1.5],
    ['"123" (chaîne)', "123"],
    ["2^32 + 5", 2 ** 32 + 5],
    ["null", null],
  ] as [string, unknown][])("rng = %s ⇒ bad_shape", (_n, value) => {
    const t = resign(MID_TEXT, (st) => void (st.rng = value));
    expectError(decodeSave(t), "bad_shape", /state\.rng/);
  });

  it("rng aux bornes exactes 0 et 2^32-1 ⇒ accepté (aucune autre contrainte)", () => {
    for (const rng of [0, 0xffffffff]) {
      const r = decodeSave(resign(MID_TEXT, (st) => void (st.rng = rng)));
      expect(r.ok && r.state.rng).toBe(rng);
    }
  });
});

describe("ids et références croisées", () => {
  it("ids en double entre une tente et un nœud ⇒ invariants (id dupliqué)", () => {
    const t = resign(MID_TEXT, (st) => void ((st as S).tents[0]!.id = (st as S).nodes[0]!.id));
    expectError(decodeSave(t), "invariants", /id dupliqué/);
  });

  it("deux drops avec le même id ⇒ invariants", () => {
    const t = resign(MID_TEXT, (st) => {
      const s = st as S;
      const d = s.drops[0]!;
      s.drops.push({ ...d, pos: { x: 1500, y: 1500 } });
    });
    expectError(decodeSave(t), "invariants", /id dupliqué/);
  });

  it("nextId abaissé sous des ids existants ⇒ invariants", () => {
    const t = resign(MID_TEXT, (st) => void (st.nextId = 2));
    expectError(decodeSave(t), "invariants", /id invalide/);
  });

  it("survivant sur une tente inexistante ⇒ invariants", () => {
    const resting = MID.survivors.find((v) => v.status === "resting");
    expect(resting).toBeDefined();
    const t = resign(MID_TEXT, (st) => {
      const v = (st as S).survivors.find((x) => x.id === resting!.id)!;
      v.tentId = 9999;
    });
    expectError(decodeSave(t), "invariants", /pointe vers une tente qui ne le pointe pas/);
  });

  it("survivant au repos sans tente (tentId null) ⇒ invariants", () => {
    const resting = MID.survivors.find((v) => v.status === "resting")!;
    const t = resign(MID_TEXT, (st) => {
      (st as S).survivors.find((x) => x.id === resting.id)!.tentId = null;
    });
    expectError(decodeSave(t), "invariants", /tentId incohérent/);
  });

  it("tente occupée par un survivant inexistant ⇒ invariants", () => {
    const t = resign(MID_TEXT, (st) => {
      const tent = (st as S).tents.find((x) => x.status === "free" || x.status === "messy")!;
      tent.status = "occupied";
      tent.occupantId = 9999;
      tent.cleanProgress = 0;
    });
    expectError(decodeSave(t), "invariants", /occupant ne la pointe pas/);
  });

  it("file qui référence un survivant inexistant ou en double ⇒ invariants", () => {
    expectError(decodeSave(resign(MID_TEXT, (st) => void (st as S).queue.push(9999))), "invariants", /inexistant/);
    if (MID.queue.length > 0) {
      const t = resign(MID_TEXT, (st) => void (st as S).queue.push((st as S).queue[0]));
      expectError(decodeSave(t), "invariants", /dupliqués dans la file/);
    }
  });

  it("tente ajoutée hors emplacement ⇒ invariants", () => {
    const t = resign(MID_TEXT, (st) => {
      const s = st as S;
      s.tents.push({ id: 9000, tile: { tx: 7, ty: 7 }, status: "free", occupantId: null, cleanProgress: 0 });
      st.nextId = 9001;
    });
    expectError(decodeSave(t), "invariants", /nombre de tentes|ni tente initiale/);
  });
});

describe("champs manquants imbriqués / coûts", () => {
  it.each([
    ["drops[0].amount", (s: S) => void delete s.drops[0]!.amount, /drops\[0\]\.amount: clé manquante/],
    ["nodes[0].tile", (s: S) => void delete s.nodes[0]!.tile, /nodes\[0\]\.tile: clé manquante/],
    ["resources.coins", (s: S) => void delete s.resources.coins, /resources\.coins: clé manquante/],
    ["buildSlots[1].payCooldown", (s: S) => void delete s.buildSlots[1]!.payCooldown, /payCooldown: clé manquante/],
  ] as [string, (s: S) => void, RegExp][])("%s supprimé ⇒ bad_shape", (_n, mutate, detail) => {
    expectError(decodeSave(resign(MID_TEXT, (st) => mutate(st as S))), "bad_shape", detail);
  });

  it("coût de slot gonflé (9999) ou réordonné ⇒ invariants", () => {
    expectError(decodeSave(resign(MID_TEXT, (st) => void ((st as S).buildSlots[0]!.cost = 9999))), "invariants", /coût/);
    const t = resign(MID_TEXT, (st) => {
      const b = (st as S).buildSlots;
      [b[0], b[1]] = [b[1]!, b[0]!];
    });
    expectError(decodeSave(t), "invariants");
  });

  it("nœud déplacé ou de sorte changée ⇒ invariants", () => {
    expectError(decodeSave(resign(MID_TEXT, (st) => void ((st as S).nodes[0]!.kind = (st as S).nodes[0]!.kind === "tree" ? "bush" : "tree"))), "invariants");
    expectError(decodeSave(resign(MID_TEXT, (st) => void ((st as S).nodes[0]!.tile = { tx: 1, ty: 1 }))), "invariants");
  });
});
