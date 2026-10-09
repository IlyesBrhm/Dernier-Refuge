// Réconciliation scène ⇐ SceneFrame : Map<SceneKey, View> — crée, met à jour, retire.
// Personnages et drops retirés retournent dans un pool borné (au-delà : détruits).

import type * as THREE from "three";
import type { DropResource } from "../../core";
import { POOLS, type CharacterModel } from "./config";
import { hash32, hashUnit } from "./hash";
import type { SceneItem as AnySceneItem, FireItem, SceneFrame, SceneKey } from "./scene-model";

/** Le feu (unique) a sa propre vue persistante (views/fire-view.ts), hors réconciliation. */
type SceneItem = Exclude<AnySceneItem, FireItem>;
import { CharacterView } from "./views/character-view";
import { DropView } from "./views/drop-view";
import type { FrameContext, ViewKit } from "./views/kit";
import { NodeView } from "./views/node-view";
import { SlotView } from "./views/slot-view";
import { TentView } from "./views/tent-view";

type AnyView = CharacterView | NodeView | TentView | SlotView | DropView;

export interface Reconciler {
  sync(frame: SceneFrame, ctx: FrameContext): void;
  /** Nombre de vues vivantes / en pool (débogage). */
  stats(): { views: number; pooledCharacters: number; pooledDrops: number };
  /** Détruit toutes les vues et vide les pools. */
  clear(): void;
}

function matches(view: AnyView, item: SceneItem): boolean {
  switch (item.type) {
    case "character":
      return view.kind === "character" && view.model === item.model && view.tint === item.tint;
    case "drop":
      return view.kind === "drop" && view.resource === item.resource;
    default:
      return view.kind === item.type;
  }
}

export function createReconciler(parent: THREE.Object3D, kit: ViewKit): Reconciler {
  const views = new Map<SceneKey, AnyView>();
  const characterPool: CharacterView[] = [];
  const dropPool: DropView[] = [];
  let gen = 0;

  function takeCharacter(model: CharacterModel, tint: number): CharacterView {
    const i = characterPool.findIndex((v) => v.model === model && v.tint === tint);
    if (i >= 0) {
      const v = characterPool.splice(i, 1)[0] as CharacterView;
      v.revive();
      return v;
    }
    return new CharacterView(kit, model, tint);
  }

  function takeDrop(resource: DropResource, key: SceneKey): DropView {
    const i = dropPool.findIndex((v) => v.resource === resource);
    if (i >= 0) return dropPool.splice(i, 1)[0] as DropView;
    let h = 0;
    for (let k = 0; k < key.length; k++) h = hash32(h, key.charCodeAt(k));
    return new DropView(kit, resource, hashUnit(h) * 10);
  }

  function create(item: SceneItem): AnyView {
    switch (item.type) {
      case "character":
        return takeCharacter(item.model, item.tint);
      case "tree":
      case "bush":
        return new NodeView(kit, item.type);
      case "tent":
        return new TentView(kit);
      case "slot":
        return new SlotView(kit);
      case "drop":
        return takeDrop(item.resource, item.key);
    }
  }

  function release(view: AnyView): void {
    if (view.kind === "character") {
      if (characterPool.length < POOLS.characters) {
        view.park();
        characterPool.push(view);
      } else view.destroy();
    } else if (view.kind === "drop") {
      if (dropPool.length < POOLS.drops) {
        view.park();
        dropPool.push(view);
      } else view.destroy();
    } else view.destroy();
  }

  function update(view: AnyView, item: SceneItem, ctx: FrameContext): void {
    switch (item.type) {
      case "character":
        (view as CharacterView).update(item, ctx);
        break;
      case "tree":
      case "bush":
        (view as NodeView).update(item, ctx);
        break;
      case "tent":
        (view as TentView).update(item, ctx);
        break;
      case "slot":
        (view as SlotView).update(item, ctx);
        break;
      case "drop":
        (view as DropView).update(item, ctx);
        break;
    }
  }

  return {
    sync(frame, ctx): void {
      gen++;
      for (const item of frame.items) {
        if (item.type === "fire") continue;
        let view = views.get(item.key);
        if (view && !matches(view, item)) {
          release(view);
          view = undefined;
        }
        if (!view) {
          view = create(item);
          views.set(item.key, view);
          parent.add(view.object);
        }
        view.gen = gen;
        update(view, item, ctx);
      }
      for (const [key, view] of views) {
        if (view.gen !== gen) {
          views.delete(key);
          release(view);
        }
      }
    },

    stats: () => ({ views: views.size, pooledCharacters: characterPool.length, pooledDrops: dropPool.length }),

    clear(): void {
      for (const v of views.values()) v.destroy();
      views.clear();
      for (const v of characterPool) v.destroy();
      characterPool.length = 0;
      for (const v of dropPool) v.destroy();
      dropPool.length = 0;
    },
  };
}
