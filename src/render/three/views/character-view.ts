// Vue d'un personnage (joueur ou survivant) : position, orientation lissée, clip d'animation.
// Le clip est un état VISUEL déduit de la scène (déplacement, action du joueur), aucune règle.

import * as THREE from "three";
import type { CharacterInstance, ClipName } from "../characters";
import { ANIM, MODEL_YAW, type CharacterModel } from "../config";
import type { CharacterItem } from "../scene-model";
import type { FrameContext, ViewKit } from "./kit";

function wrapAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export class CharacterView {
  readonly kind = "character" as const;
  readonly object = new THREE.Group();
  readonly model: CharacterModel;
  readonly tint: number;
  gen = 0;
  private readonly inst: CharacterInstance;
  private current: THREE.AnimationAction | null = null;
  private currentName: ClipName | null = null;
  private yaw = 0;
  private yawInit = false;

  constructor(kit: ViewKit, model: CharacterModel, tint: number) {
    this.model = model;
    this.tint = tint;
    this.inst = kit.characters.create(model, tint);
    this.object.add(this.inst.model);
    // Avant du modèle aligné sur +Z (cap atan2(dx, dy) appliqué au groupe parent).
    this.inst.model.rotation.y = MODEL_YAW.characters;
    this.object.name = model;
  }

  /** Remise à zéro avant réutilisation depuis le pool. */
  revive(): void {
    this.current = null;
    this.currentName = null;
    this.yawInit = false;
  }

  /** Retour au pool : actions arrêtées et caches d'animation libérés (recréés à la réutilisation). */
  park(): void {
    this.inst.mixer.stopAllAction();
    this.inst.mixer.uncacheRoot(this.inst.model);
    this.current = null;
    this.currentName = null;
    this.object.removeFromParent();
  }

  update(item: CharacterItem, ctx: FrameContext): void {
    this.object.visible = item.visible;
    this.object.position.set(item.x, 0, item.z);

    // Orientation lissée vers le cap (≤ maxTurnRate rad/s), conservée si heading === null.
    if (item.heading !== null) {
      if (!this.yawInit) {
        this.yaw = item.heading;
        this.yawInit = true;
      } else {
        const diff = wrapAngle(item.heading - this.yaw);
        const step = ANIM.maxTurnRate * ctx.dt;
        this.yaw = wrapAngle(this.yaw + Math.max(-step, Math.min(step, diff)));
      }
    }
    this.object.rotation.y = this.yaw;

    let clip: ClipName = item.moving ? "walk" : "idle";
    if (!item.moving && item.role === "player") {
      if (ctx.playerAction === "harvest") clip = "use";
      else if (ctx.playerAction === "welcome") clip = "interact";
    }
    this.play(clip);
    if (item.visible) this.inst.mixer.update(ctx.dt);
  }

  private play(name: ClipName): void {
    if (name === this.currentName) return;
    const next = this.inst.action(name) ?? (name !== "idle" ? this.inst.action("idle") : null);
    this.currentName = name;
    if (!next || next === this.current) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (this.current) this.current.crossFadeTo(next, ANIM.crossFadeS, false);
    this.current = next;
  }

  destroy(): void {
    this.inst.destroy();
    this.object.removeFromParent();
  }
}
