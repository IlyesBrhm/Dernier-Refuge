// Vue d'un butin posé au sol (bois : bûches ; nourriture : baies), léger flottement. Montant : calque 2D.

import * as THREE from "three";
import type { DropResource } from "../../../core";
import { ANIM } from "../config";
import type { DropItem } from "../scene-model";
import type { FrameContext, ViewKit } from "./kit";

export function lootMesh(kit: ViewKit, resource: DropResource): THREE.Mesh {
  const src = resource === "wood" ? kit.proc.logs : kit.proc.berryCluster;
  const mesh = new THREE.Mesh(src.geometry, src.material);
  mesh.castShadow = true;
  return mesh;
}

export class DropView {
  readonly kind = "drop" as const;
  readonly object = new THREE.Group();
  readonly resource: DropResource;
  gen = 0;
  private readonly mesh: THREE.Mesh;
  private readonly phase: number;

  constructor(kit: ViewKit, resource: DropResource, phase: number) {
    this.resource = resource;
    this.phase = phase;
    this.mesh = lootMesh(kit, resource);
    this.object.add(this.mesh);
    this.object.name = `drop-${resource}`;
  }

  update(item: DropItem, ctx: FrameContext): void {
    this.object.position.set(item.x, 0, item.z);
    const t = ctx.now / 1000 + this.phase;
    this.mesh.position.y = ANIM.dropBobBase + Math.sin(t * ANIM.dropBobRate) * ANIM.dropBobAmplitude;
    this.mesh.rotation.y = t * ANIM.dropSpinRate;
  }

  park(): void {
    this.object.removeFromParent();
  }

  destroy(): void {
    this.object.removeFromParent();
  }
}
