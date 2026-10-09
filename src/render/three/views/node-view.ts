// Vue d'un nœud récoltable (arbre ou buisson) : modèle prêt / épuisé, pousse, anneau de cible,
// tremblement pendant la récolte, rebond à la repousse (transition détectée par la vue).

import * as THREE from "three";
import { BERRIES } from "../../shapes";
import { ANIM, COLORS3D, MODEL_IDS, MODEL_SCALE, TILE_METERS } from "../config";
import { DECAL_Y } from "../procedural";
import type { NodeItem } from "../scene-model";
import { bounceScale, setMaterials, type FrameContext, type ViewKit } from "./kit";

const RED = new THREE.Color(COLORS3D.berryRed);
const PURPLE = new THREE.Color(COLORS3D.berryPurple);

export class NodeView {
  readonly kind: "tree" | "bush";
  readonly object = new THREE.Group();
  gen = 0;
  private readonly kit: ViewKit;
  /** Arbre prêt ou buisson (prêt / vide). */
  private readonly body: THREE.Group;
  private readonly pivot = new THREE.Group();
  private readonly stump: THREE.Mesh | null = null;
  private readonly sapling: THREE.Group | null = null;
  private readonly ring: THREE.Mesh;
  private readonly originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private lastReady: boolean | null = null;
  private bounceStart = -Infinity;
  private emptyLook = false;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(kit: ViewKit, kind: "tree" | "bush") {
    this.kit = kit;
    this.kind = kind;
    this.object.name = kind;
    this.object.add(this.pivot);
    if (kind === "tree") {
      this.body = kit.lib.create(MODEL_IDS.nodeTree);
      const stump = new THREE.Mesh(kit.proc.stump.geometry, kit.proc.stump.material);
      stump.castShadow = true;
      stump.receiveShadow = true;
      this.stump = stump;
      this.object.add(stump);
      const sapling = kit.lib.create(MODEL_IDS.nodeTree);
      sapling.position.y = 0.3;
      this.sapling = sapling;
      this.object.add(sapling);
    } else {
      this.body = kit.lib.create(MODEL_IDS.bush);
      this.body.scale.multiplyScalar(MODEL_SCALE.bush);
    }
    this.pivot.add(this.body);
    this.ring = new THREE.Mesh(kit.proc.targetRing.geometry, kit.proc.targetRing.material);
    this.ring.position.y = DECAL_Y;
    this.ring.renderOrder = 1;
    this.object.add(this.ring);
  }

  update(item: NodeItem, ctx: FrameContext): void {
    this.object.position.set(item.x, 0, item.z);
    this.pivot.rotation.y = item.yaw;
    if (this.sapling) this.sapling.rotation.y = item.yaw;

    // Rebond quand le nœud repasse « prêt » (jamais à la première image).
    if (this.lastReady === false && item.ready && ctx.live) this.bounceStart = ctx.now;
    this.lastReady = item.ready;
    const bounce = bounceScale((ctx.now - this.bounceStart) / ANIM.bounceMs);

    this.ring.visible = item.targeted;

    // Tremblement pendant la récolte.
    const shaking = item.ready && item.targeted && item.harvest > 0;
    const phase = (ctx.now / 1000) * ANIM.shakeHz * Math.PI * 2;
    this.pivot.rotation.z = shaking ? Math.sin(phase) * ANIM.shakeAmplitudeRad : 0;
    this.pivot.rotation.x = shaking ? Math.cos(phase * 1.3) * ANIM.shakeAmplitudeRad * 0.5 : 0;

    if (this.kind === "tree") {
      this.body.visible = item.ready;
      this.pivot.scale.setScalar(item.ready ? bounce : 1);
      if (this.stump) this.stump.visible = !item.ready;
      if (this.sapling) {
        this.sapling.visible = !item.ready && item.regrow > 0.05;
        this.sapling.scale.setScalar(MODEL_SCALE.sapling[0] + MODEL_SCALE.sapling[1] * item.regrow);
      }
      return;
    }

    // Buisson : vide = matériau désaturé + taille selon la repousse ; prêt = baies.
    const empty = !item.ready;
    if (empty !== this.emptyLook) {
      this.emptyLook = empty;
      setMaterials(this.body, empty ? (b) => this.kit.emptyBush.get(b) : (b) => b, this.originals);
    }
    const g = item.ready ? bounce : MODEL_SCALE.emptyBush[0] + MODEL_SCALE.emptyBush[1] * item.regrow;
    this.pivot.scale.setScalar(g);
    if (item.ready) this.pushBerries(item, ctx, g);
  }

  private pushBerries(item: NodeItem, ctx: FrameContext, g: number): void {
    const cos = Math.cos(item.yaw);
    const sin = Math.sin(item.yaw);
    for (let i = 0; i < BERRIES.length; i++) {
      const b = BERRIES[i];
      if (!b) continue;
      const ox = b[0] * TILE_METERS * g;
      const oz = b[1] * TILE_METERS * g;
      // Rotation du motif avec le buisson ; hauteur sur un dôme approximant la touffe.
      const rx = ox * cos + oz * sin;
      const rz = -ox * sin + oz * cos;
      const r = Math.min(1, Math.hypot(ox, oz) / (0.72 * g));
      const y = (0.3 + 0.85 * Math.sqrt(1 - r * r)) * g;
      this.v.set(item.x + rx, y, item.z + rz);
      this.q.setFromAxisAngle(this.up, 0);
      this.s.setScalar(g);
      this.m.compose(this.v, this.q, this.s);
      ctx.berries.push(this.m, i % 2 === 0 ? RED : PURPLE);
    }
  }

  destroy(): void {
    this.object.removeFromParent();
  }
}
