// Vue d'une tente, trois aspects distincts :
// - libre / assignée : tente montée (toile) éclaircie et verdie + liseré au sol (vert ; jaune pulsé si assignée) ;
// - occupée : même tente aux couleurs d'origine, sans liseré (barre de repos sur le calque 2D) ;
// - en désordre : toile à moitié, assombrie et inclinée (« ! » + barre de nettoyage sur le calque).
// Apparition « pop » quand la tente est construite en cours de partie.

import * as THREE from "three";
import type { TentStatus } from "../../../core";
import { ANIM, MODEL_IDS, MODEL_YAW } from "../config";
import { DECAL_Y } from "../procedural";
import type { TentItem } from "../scene-model";
import { easeOutBack, setMaterials, type FrameContext, type ViewKit } from "./kit";

type TentLook = "free" | "closed" | "messy";

function lookOf(status: TentStatus): TentLook {
  return status === "occupied" ? "closed" : status === "messy" ? "messy" : "free";
}

export class TentView {
  readonly kind = "tent" as const;
  readonly object = new THREE.Group();
  gen = 0;
  private readonly kit: ViewKit;
  private readonly pivot = new THREE.Group();
  private readonly models = new Map<TentLook, THREE.Group>();
  private readonly frame: THREE.Mesh;
  private look: TentLook | null = null;
  private popStart = -Infinity;
  private first = true;

  constructor(kit: ViewKit) {
    this.kit = kit;
    this.object.name = "tent";
    this.object.add(this.pivot);
    // Ouverture de la tente vers +Z (porte du core en +y).
    this.pivot.rotation.y = MODEL_YAW.tent;
    this.frame = new THREE.Mesh(kit.proc.tentFrame.geometry, kit.proc.tentFrame.free);
    this.frame.position.y = DECAL_Y;
    this.frame.renderOrder = 1;
    this.object.add(this.frame);
  }

  private modelFor(look: TentLook): THREE.Group {
    let m = this.models.get(look);
    if (!m) {
      m = this.kit.lib.create(look === "messy" ? MODEL_IDS.tentMessy : MODEL_IDS.tent);
      if (look === "messy") {
        setMaterials(m, (b) => this.kit.messyTent.get(b), new Map());
        m.rotation.z = ANIM.messyTiltRad;
      } else if (look === "free") {
        setMaterials(m, (b) => this.kit.freeTent.get(b), new Map());
      }
      this.models.set(look, m);
      this.pivot.add(m);
    }
    return m;
  }

  update(item: TentItem, ctx: FrameContext): void {
    if (this.first) {
      this.first = false;
      // Tente apparue en cours de partie (emplacement construit) : petite animation d'apparition.
      if (ctx.live) this.popStart = ctx.now;
    }
    this.object.position.set(item.x, 0, item.z);

    const look = lookOf(item.status);
    if (look !== this.look) {
      this.look = look;
      const shown = this.modelFor(look);
      for (const m of this.models.values()) m.visible = m === shown;
    }

    const t = (ctx.now - this.popStart) / ANIM.popMs;
    this.pivot.scale.setScalar(t >= 1 ? 1 : Math.max(0.01, easeOutBack(Math.max(0, t))));

    const proc = this.kit.proc.tentFrame;
    this.frame.visible = item.status === "free" || item.status === "assigned";
    this.frame.material = item.status === "assigned" ? proc.assigned : proc.free;
  }

  destroy(): void {
    this.object.removeFromParent();
  }
}
