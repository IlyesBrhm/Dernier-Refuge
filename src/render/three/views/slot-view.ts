// Vue d'un emplacement de construction : tapis pointillé (plus clair si le joueur est dessus) et
// anneau de progression (drawRange, sans reconstruire la géométrie). Coût restant : calque 2D.

import * as THREE from "three";
import { DECAL_Y } from "../procedural";
import type { SlotItem } from "../scene-model";
import type { FrameContext, ViewKit } from "./kit";

const RING_SEGMENTS = 64;

export class SlotView {
  readonly kind = "slot" as const;
  readonly object = new THREE.Group();
  gen = 0;
  private readonly kit: ViewKit;
  private readonly plane: THREE.Mesh;
  private readonly ringGeometry: THREE.BufferGeometry;
  private readonly ring: THREE.Mesh;
  private shownSegments = -1;

  constructor(kit: ViewKit) {
    this.kit = kit;
    this.object.name = "slot";
    const s = kit.proc.slot;
    this.plane = new THREE.Mesh(s.plane, s.normal);
    this.plane.position.y = DECAL_Y;
    this.plane.receiveShadow = true;
    const back = new THREE.Mesh(s.ringBack, s.ringBackMaterial);
    back.position.y = DECAL_Y + 0.005;
    back.renderOrder = 1;
    this.ringGeometry = kit.proc.createSlotRing();
    this.ring = new THREE.Mesh(this.ringGeometry, s.ringMaterial);
    this.ring.position.y = DECAL_Y + 0.01;
    this.ring.renderOrder = 2;
    this.object.add(this.plane, back, this.ring);
  }

  update(item: SlotItem, _ctx: FrameContext): void {
    this.object.position.set(item.x, 0, item.z);
    this.plane.material = item.playerOn ? this.kit.proc.slot.active : this.kit.proc.slot.normal;
    const seg = Math.floor(RING_SEGMENTS * Math.min(1, Math.max(0, item.ratio)));
    if (seg !== this.shownSegments) {
      this.shownSegments = seg;
      this.ringGeometry.setDrawRange(0, 6 * seg);
    }
    this.ring.visible = seg > 0;
  }

  destroy(): void {
    this.ringGeometry.dispose();
    this.object.removeFromParent();
  }
}
