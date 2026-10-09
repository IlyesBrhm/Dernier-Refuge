// Hôte de rendu (src/app/render-host.ts) : délégation et remplacement à chaud du renderer
// (repli 2D sur contexte WebGL perdu). Faux renderers, sans DOM.

import { createRenderHost } from "../../src/app/render-host";
import type { GameState } from "../../src/core/state";
import type { Renderer } from "../../src/render/renderer";
import { fresh } from "../core/helpers";

type Call = string;

/** Derniers arguments (prev, curr) reçus, par « renderer.méthode ». */
const seen = new Map<string, [Readonly<GameState>, Readonly<GameState>]>();
const prev = fresh(1);
const curr = fresh(2);

/** Faux renderer qui journalise ses appels (nom préfixé) dans `log`. */
function fake(name: string, log: Call[], withDispose = true): Renderer {
  const r: Renderer = {
    onTick: (prev, curr) => {
      log.push(`${name}.onTick`);
      seen.set(`${name}.onTick`, [prev, curr]);
    },
    draw: (prev, curr, alpha) => {
      log.push(`${name}.draw(${alpha})`);
      seen.set(`${name}.draw`, [prev, curr]);
    },
    reset: () => log.push(`${name}.reset`),
  };
  if (withDispose) r.dispose = () => log.push(`${name}.dispose`);
  return r;
}

beforeEach(() => seen.clear());

describe("createRenderHost — délégation", () => {
  it("onTick, draw, reset, dispose délégués au renderer courant avec les mêmes arguments", () => {
    const log: Call[] = [];
    const host = createRenderHost(fake("a", log));
    host.onTick(prev, curr);
    host.draw(prev, curr, 0.25);
    host.reset();
    host.dispose?.();
    expect(log).toEqual(["a.onTick", "a.draw(0.25)", "a.reset", "a.dispose"]);
    expect(seen.get("a.onTick")?.[0]).toBe(prev);
    expect(seen.get("a.onTick")?.[1]).toBe(curr);
    expect(seen.get("a.draw")?.[0]).toBe(prev);
    expect(seen.get("a.draw")?.[1]).toBe(curr);
  });

  it("dispose sans dispose optionnel sur le renderer : pas d'exception", () => {
    const log: Call[] = [];
    const host = createRenderHost(fake("a", log, false));
    expect(() => host.dispose?.()).not.toThrow();
    expect(log).toEqual([]);
  });

  it("après swap, tout est délégué au nouveau renderer et plus jamais à l'ancien", () => {
    const log: Call[] = [];
    const host = createRenderHost(fake("a", log));
    host.swap(fake("b", log));
    log.length = 0;
    host.onTick(prev, curr);
    host.draw(prev, curr, 1);
    host.reset();
    host.dispose?.();
    expect(log).toEqual(["b.onTick", "b.draw(1)", "b.reset", "b.dispose"]);
  });
});

describe("createRenderHost — swap", () => {
  it("dispose de l'ancien PUIS reset du nouveau, une seule fois chacun", () => {
    const log: Call[] = [];
    const host = createRenderHost(fake("a", log));
    host.swap(fake("b", log));
    expect(log).toEqual(["a.dispose", "b.reset"]);
  });

  it("ancien renderer sans dispose : seul reset du nouveau est appelé", () => {
    const log: Call[] = [];
    const host = createRenderHost(fake("a", log, false));
    host.swap(fake("b", log));
    expect(log).toEqual(["b.reset"]);
  });

  it("swap(courant) ne fait rien (ni dispose, ni reset, onFirstDraw non réarmé)", () => {
    const log: Call[] = [];
    const onFirstDraw = vi.fn();
    const a = fake("a", log);
    const host = createRenderHost(a, { onFirstDraw });
    host.draw(prev, curr, 0);
    host.swap(a);
    host.draw(prev, curr, 0);
    expect(log).toEqual(["a.draw(0)", "a.draw(0)"]);
    expect(onFirstDraw).toHaveBeenCalledTimes(1);
  });

  it("dispose de l'ancien qui lève : le nouveau est quand même installé et réinitialisé", () => {
    const log: Call[] = [];
    const a = fake("a", log);
    a.dispose = () => {
      log.push("a.dispose");
      throw new Error("boom");
    };
    const host = createRenderHost(a);
    expect(() => host.swap(fake("b", log))).toThrow("boom");
    expect(log).toEqual(["a.dispose", "b.reset"]);
    host.draw(prev, curr, 0.5);
    expect(log.at(-1)).toBe("b.draw(0.5)");
  });

  it("swaps successifs : chaque ancien est libéré une fois, dans l'ordre", () => {
    const log: Call[] = [];
    const host = createRenderHost(fake("a", log));
    host.swap(fake("b", log));
    host.swap(fake("c", log));
    expect(log).toEqual(["a.dispose", "b.reset", "b.dispose", "c.reset"]);
  });
});

describe("createRenderHost — onFirstDraw", () => {
  it("appelé après le premier draw seulement (pas sur onTick ni reset), une seule fois", () => {
    const log: Call[] = [];
    const order: string[] = [];
    const host = createRenderHost(fake("a", log), { onFirstDraw: () => order.push(`first after ${log.at(-1)}`) });
    host.onTick(prev, curr);
    host.reset();
    expect(order).toEqual([]);
    host.draw(prev, curr, 0);
    host.draw(prev, curr, 0.5);
    expect(order).toEqual(["first after a.draw(0)"]);
  });

  it("réarmé après un swap : rappelé au premier draw du nouveau renderer, pas avant", () => {
    const log: Call[] = [];
    const onFirstDraw = vi.fn();
    const host = createRenderHost(fake("a", log), { onFirstDraw });
    host.draw(prev, curr, 0);
    expect(onFirstDraw).toHaveBeenCalledTimes(1);
    host.swap(fake("b", log));
    expect(onFirstDraw).toHaveBeenCalledTimes(1); // pas d'appel au swap lui-même
    host.onTick(prev, curr);
    expect(onFirstDraw).toHaveBeenCalledTimes(1);
    host.draw(prev, curr, 0);
    expect(onFirstDraw).toHaveBeenCalledTimes(2);
    host.draw(prev, curr, 0);
    expect(onFirstDraw).toHaveBeenCalledTimes(2);
  });

  it("swap avant tout draw : un seul appel au premier draw", () => {
    const onFirstDraw = vi.fn();
    const host = createRenderHost(fake("a", []), { onFirstDraw });
    host.swap(fake("b", []));
    host.draw(prev, curr, 0);
    host.draw(prev, curr, 0);
    expect(onFirstDraw).toHaveBeenCalledTimes(1);
  });

  it("sans option onFirstDraw : draw ne lève pas", () => {
    const host = createRenderHost(fake("a", []));
    expect(() => host.draw(prev, curr, 0)).not.toThrow();
  });
});
