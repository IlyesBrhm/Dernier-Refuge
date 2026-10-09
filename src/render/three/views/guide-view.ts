// Flèche du tutoriel en 3D (docs/design/ui-polish.md §4.6) : chevron procédural ember-500 (contour
// night-900) face caméra au-dessus de la cible, rebond ±0,25 m à 1 Hz, et anneau au sol pulsé.
// 2 draw calls (chevron + anneau), aucune lumière, matériaux non éclairés (lisibles de jour comme de
// nuit), créée une fois, compilée au warm-up ; seul `visible` bascule. Mouvement réduit : immobile.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GUIDE, GUIDE_ARROW_SHAPE, GUIDE_COLORS } from "../../presentation";
import { DECAL_Y } from "../procedural";

type Pt = readonly [number, number];

/** Polygone décalé vers l'extérieur de `d` (jonctions en onglet bornées). Polygone simple, sens quelconque. */
function offsetPolygon(points: readonly Pt[], d: number): Pt[] {
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i] as Pt;
    const [x1, y1] = points[(i + 1) % n] as Pt;
    area += x0 * y1 - x1 * y0;
  }
  const sign = area >= 0 ? 1 : -1; // CCW : normale extérieure = (ey, −ex)
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i] as Pt;
    const a = points[(i - 1 + n) % n] as Pt;
    const b = points[(i + 1) % n] as Pt;
    const e1x = p[0] - a[0];
    const e1y = p[1] - a[1];
    const e2x = b[0] - p[0];
    const e2y = b[1] - p[1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    const n1x = (sign * e1y) / l1;
    const n1y = (-sign * e1x) / l1;
    const n2x = (sign * e2y) / l2;
    const n2y = (-sign * e2x) / l2;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) {
      out.push([p[0] + n1x * d, p[1] + n1y * d]);
      continue;
    }
    mx /= ml;
    my /= ml;
    const cos = mx * n1x + my * n1y;
    const k = Math.min(2.5, 1 / Math.max(0.2, cos));
    out.push([p[0] + mx * d * k, p[1] + my * d * k]);
  }
  return out;
}

function shapeGeometry(points: readonly Pt[], color: THREE.Color): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(shape);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

export class GuideView {
  readonly object = new THREE.Group();
  private readonly chevron: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly chevronGeometry: THREE.BufferGeometry;
  private readonly ringGeometry: THREE.BufferGeometry;
  private readonly chevronMaterial: THREE.MeshBasicMaterial;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private shown = false;

  constructor() {
    this.object.name = "tutorial-guide";
    // Silhouette pointe vers le bas : (x, y) ⇒ (y, −x). Contour sombre dessiné AVANT le remplissage
    // (sans test de profondeur, l'ordre des indices fait foi), puis liseré clair, puis remplissage.
    const down = GUIDE_ARROW_SHAPE.map(([x, y]) => [y, -x] as Pt);
    const fill = new THREE.Color(GUIDE_COLORS.fill);
    const stroke = new THREE.Color(GUIDE_COLORS.stroke);
    const shine = new THREE.Color(GUIDE_COLORS.shine);
    const parts = [
      shapeGeometry(offsetPolygon(down, 0.09), stroke),
      shapeGeometry(offsetPolygon(down, 0.025), shine),
      shapeGeometry(down, fill),
    ];
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) throw new Error("fusion du chevron impossible");
    // Pointe à l'origine (le groupe est placé à la hauteur de la pointe).
    merged.translate(0, 0.5, 0);
    merged.scale(GUIDE.chevronM, GUIDE.chevronM, GUIDE.chevronM);
    this.chevronGeometry = merged;
    this.chevronMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.chevron = new THREE.Mesh(this.chevronGeometry, this.chevronMaterial);
    this.chevron.name = "guide-chevron";
    this.chevron.renderOrder = 20;
    this.chevron.frustumCulled = false;

    // Anneau au sol : bords sombres, bande orange au milieu (dégradé par sommet).
    const ring = new THREE.RingGeometry(GUIDE.ringInnerM, GUIDE.ringOuterM, 40, 2);
    ring.rotateX(-Math.PI / 2);
    const pos = ring.getAttribute("position");
    const colors = new Float32Array(pos.count * 3);
    const mid = (GUIDE.ringInnerM + GUIDE.ringOuterM) / 2;
    const halfW = (GUIDE.ringOuterM - GUIDE.ringInnerM) / 2;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const k = Math.min(1, Math.abs(r - mid) / halfW);
      c.copy(fill).lerp(stroke, k * 0.85);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    ring.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.ringGeometry = ring;
    this.ringMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    this.ring.name = "guide-ring";
    this.ring.renderOrder = 1;
    this.ring.position.y = DECAL_Y + 0.01;
    this.ring.matrixAutoUpdate = true;

    this.object.add(this.chevron, this.ring);
    this.object.visible = false;
  }

  /** Warm-up : visible pour compiler les deux programmes. */
  showForWarmup(x: number, z: number): void {
    this.object.position.set(x, 0, z);
    this.chevron.position.set(0, GUIDE.heightM, 0);
    this.object.visible = true;
  }

  /**
   * Place la flèche (mètres) ou la masque (`target` null). `height` = hauteur de la pointe au-dessus du
   * sol ; face à la caméra ; rebond et pulsation sauf mouvement réduit.
   */
  update(target: { x: number; z: number; height: number } | null, camera: THREE.Camera, nowMs: number, reduced: boolean): void {
    this.shown = target !== null;
    this.object.visible = this.shown;
    if (!target) return;
    const t = nowMs / 1000;
    const wave = reduced ? 0 : Math.sin(t * GUIDE.bounceHz * Math.PI * 2);
    this.object.position.set(target.x, 0, target.z);
    this.chevron.position.set(0, target.height + wave * GUIDE.bounceM, 0);
    this.chevron.quaternion.copy(camera.quaternion);
    const s = 1 + (reduced ? 0 : wave * GUIDE.ringPulse);
    this.ring.scale.set(s, 1, s);
    this.ringMaterial.opacity = reduced ? 0.9 : 0.75 + 0.2 * wave;
  }

  /** Flèche affichée à la dernière image (lecture e2e). */
  isShown(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.chevronGeometry.dispose();
    this.ringGeometry.dispose();
    this.chevronMaterial.dispose();
    this.ringMaterial.dispose();
  }
}
