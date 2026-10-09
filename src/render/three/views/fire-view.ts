// Feu de camp 3D (docs/design/day-night.md §4.4) : foyer `survival/campfire-pit` (sans ombre projetée),
// flammes en particules (1 draw call), braises émissives (1 draw call), fumée grise quand il est éteint.
// Mémoire de vue : `litFade` (0 → 1 en 0,5 s au rallumage, 1 → 0 à l'extinction). Le vacillement vient
// du temps d'AFFICHAGE (sinus), jamais de Math.random ni de l'état. Un seul feu : vue unique, gérée
// hors du réconciliateur, réutilisée après reset().

import * as THREE from "three";
import { fireFlicker, stepLitFade } from "../../daylight";
import { COLORS3D, FIRE3D, FIRE_LIGHT, MODEL_IDS, TILE_METERS } from "../config";
import { hash32, hashUnit } from "../hash";
import type { FireItem } from "../scene-model";
import type { LocalLights } from "../stage";
import { fitFootprint, setMaterials, type FrameContext, type ViewKit } from "./kit";

interface Particle {
  phase: number;
  period: number;
  angle: number;
  radius: number;
  sway: number;
}

function particles(count: number, salt: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const h = hash32(i, salt);
    const r = (k: number): number => hashUnit(hash32(h, k));
    out.push({
      phase: r(1),
      period: 0.8 + 0.6 * r(2),
      angle: r(3) * Math.PI * 2,
      radius: Math.sqrt(r(4)),
      sway: r(5) * Math.PI * 2,
    });
  }
  return out;
}

const FLAME_PARTICLES = particles(FIRE3D.flameCount, 0x666c616d);
const SMOKE_PARTICLES = particles(FIRE3D.smokeCount, 0x736d6f6b);

export class FireView {
  readonly object = new THREE.Group();
  private readonly kit: ViewKit;
  private readonly pit: THREE.Group;
  private readonly flames: THREE.Points;
  private readonly smoke: THREE.Points;
  private readonly embers: THREE.Mesh;
  private litFade = -1;
  private lastLit: boolean | null = null;
  private readonly emberColor = new THREE.Color();
  private readonly emberOut = new THREE.Color(COLORS3D.emberOut);
  private readonly emberGlow = new THREE.Color(COLORS3D.emberGlow);
  private readonly light: NonNullable<LocalLights["fire"]> = { x: 0, z: 0, ratio: 0, lit: false, strength: 0 };

  constructor(kit: ViewKit) {
    this.kit = kit;
    this.object.name = "campfire";
    this.pit = kit.lib.create(MODEL_IDS.campfire);
    fitFootprint(this.pit, FIRE3D.pitTiles * TILE_METERS);
    // Texture Kenney d'origine (colormap sRGB, chargée par GLTFLoader) conservée ; seule la couleur
    // multiplicatrice d'un CLONE est assombrie vers des tons terre (cf. COLORS3D.firePitTint).
    setMaterials(this.pit, (b) => kit.firePit.get(b), new Map());
    // Le foyer ne projette pas d'ombre (il masquerait le projecteur placé juste au-dessus).
    this.pit.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        o.receiveShadow = true;
      }
    });
    this.object.add(this.pit);
    const f = kit.proc.fire;
    this.flames = new THREE.Points(f.flames.geometry, f.flames.material);
    this.flames.name = "fire-flames";
    this.flames.renderOrder = 2;
    this.smoke = new THREE.Points(f.smoke.geometry, f.smoke.material);
    this.smoke.name = "fire-smoke";
    this.smoke.renderOrder = 2;
    this.embers = new THREE.Mesh(f.embers.geometry, f.embers.material);
    this.embers.name = "fire-embers";
    this.embers.castShadow = false;
    this.embers.receiveShadow = false;
    this.object.add(this.flames, this.smoke, this.embers);
  }

  /** Warm-up : tout visible pour compiler les programmes (points additifs, fumée, braises). */
  showAllForWarmup(x: number, z: number): void {
    this.object.position.set(x, 0, z);
    this.flames.visible = true;
    this.smoke.visible = true;
    this.flames.geometry.setDrawRange(0, FIRE3D.flameCount);
    this.smoke.geometry.setDrawRange(0, FIRE3D.smokeCount);
  }

  /** Oublie la mémoire de vue (nouvelle partie, import). */
  reset(): void {
    this.litFade = -1;
    this.lastLit = null;
  }

  /** Met à jour la vue ; renvoie l'entrée des lumières du feu pour stage.setLighting. */
  update(item: FireItem, ctx: FrameContext): NonNullable<LocalLights["fire"]> {
    this.object.position.set(item.x, 0, item.z);
    // Première image (ou après reset) : pas de fondu, état direct.
    if (this.litFade < 0 || !ctx.live) this.litFade = item.lit ? 1 : 0;
    else this.litFade = stepLitFade(this.litFade, item.lit, ctx.dt, FIRE_LIGHT.litFadeS);
    this.lastLit = item.lit;

    const t = ctx.now / 1000;
    const ratio = item.ratio;
    const fade = this.litFade;

    // Flammes : nombre ∝ bois restant, hauteur ∝ bois, couleur jaune → rouge en montant, éteintes en fondu.
    const showFlames = fade > 0.001;
    this.flames.visible = showFlames;
    if (showFlames) {
      const count = Math.max(1, Math.ceil(FIRE3D.flameCount * Math.max(ratio, 0.05)));
      const g = this.flames.geometry;
      const pos = g.getAttribute("position") as THREE.BufferAttribute;
      const col = g.getAttribute("color") as THREE.BufferAttribute;
      const height = THREE.MathUtils.lerp(FIRE3D.flameHeightMin, FIRE3D.flameHeightMax, ratio);
      for (let i = 0; i < count; i++) {
        const p = FLAME_PARTICLES[i] as Particle;
        const age = (t / p.period + p.phase) % 1;
        const shrink = 1 - 0.7 * age;
        const r = FIRE3D.flameRadius * p.radius * shrink;
        const sway = 0.06 * Math.sin(t * 4 + p.sway) * age;
        pos.setXYZ(i, Math.cos(p.angle) * r + sway, 0.15 + age * height, Math.sin(p.angle) * r);
        // Additif : la couleur sert aussi d'opacité (noir = invisible).
        const k = (1 - age) * fade;
        col.setXYZ(i, 1.0 * k, (0.75 - 0.55 * age) * k, (0.25 - 0.25 * age) * 0.6 * k);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      g.setDrawRange(0, count);
    }

    // Fumée : feu éteint (ou en train de s'éteindre), 6 particules grises lentes.
    const showSmoke = fade < 0.999;
    this.smoke.visible = showSmoke;
    if (showSmoke) {
      const g = this.smoke.geometry;
      const pos = g.getAttribute("position") as THREE.BufferAttribute;
      const col = g.getAttribute("color") as THREE.BufferAttribute;
      const k = 1 - fade;
      for (let i = 0; i < FIRE3D.smokeCount; i++) {
        const p = SMOKE_PARTICLES[i] as Particle;
        const age = (t / (p.period * 3.5) + p.phase) % 1;
        const drift = 0.25 * age;
        pos.setXYZ(i, Math.cos(p.angle) * 0.12 + drift * Math.sin(p.sway), 0.25 + age * 1.6, Math.sin(p.angle) * 0.12);
        const grey = 0.55 * (1 - age) * k;
        col.setXYZ(i, grey, grey, grey);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      g.setDrawRange(0, FIRE3D.smokeCount);
    }

    // Braises : émission 0,3 + 0,7 × bois, sombres quand le feu est éteint (matériau unique : un seul feu).
    const flicker = fireFlicker(ctx.now);
    const mat = this.kit.proc.fire.embers.material;
    const glow = (0.3 + 0.7 * ratio) * fade * flicker;
    mat.emissiveIntensity = Math.max(0.04, glow);
    this.emberColor.copy(this.emberOut).lerp(this.emberGlow, fade);
    mat.emissive.copy(this.emberColor);

    this.light.x = item.x;
    this.light.z = item.z;
    this.light.ratio = ratio;
    this.light.lit = item.lit;
    this.light.strength = fade * flicker;
    return this.light;
  }

  /** Feu allumé à la dernière image (lecture e2e). */
  isLit(): boolean {
    return this.lastLit === true;
  }

  destroy(): void {
    this.object.removeFromParent();
  }
}
