// Page d'aperçu (dev uniquement) : `npm run dev` puis http://localhost:5173/tools/asset-preview/
// Affiche les modèles du catalogue pack par pack, à l'échelle du jeu (PACK_SCALE), personnages et loup animés.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createAssetLibrary, PACK_SCALE } from "../../src/render/assets/asset-loader";
import { ASSETS, PACKS, type AssetId, type AssetPack } from "../../src/render/assets/asset-catalog";

const info = document.getElementById("info")!;
const label = document.getElementById("label")!;
const select = document.getElementById("pack") as HTMLSelectElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc7e8);
scene.add(new THREE.HemisphereLight(0xdff2ff, 0x4a5a2a, 1.2));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(20, 40, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x6f9a3e }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(80, 40, 0x3d5a22, 0x5a7f34); // 1 case = 1 tuile de 2 m
grid.position.y = 0.01;
scene.add(grid);

// Caméra orthographique inclinée, proche de la vue du jeu.
let viewSize = 14;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
camera.position.set(20, 26, 20);
const controls = new OrbitControls(camera, renderer.domElement);
function resize(): void {
  const a = innerWidth / innerHeight;
  Object.assign(camera, { left: -viewSize * a, right: viewSize * a, top: viewSize, bottom: -viewSize });
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);

// Aperçu de TOUS les modèles : conversion complète dans assets-all/ (servie par vite dev), pas seulement les livrés.
const lib = createAssetLibrary("/assets-all/");
const shown = new THREE.Group();
scene.add(shown);
let mixers: THREE.AnimationMixer[] = [];
let pickables: THREE.Object3D[] = [];

/** Joue un clip « au repos » si le modèle (ou le pack d'animations partagé) en a un. */
function animate(obj: THREE.Object3D, id: AssetId): void {
  const own = lib.clips(id);
  const shared = ASSETS[id].pack === "characters" ? [...lib.clips("animations/Rig_Medium_General"), ...lib.clips("animations/Rig_Medium_MovementBasic")] : [];
  const clips = own.length ? own : shared;
  const clip = clips.find((c) => /^Idle(_A)?$/.test(c.name)) ?? clips.find((c) => c.name !== "T-Pose");
  if (!clip) return;
  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(clip).play();
  mixers.push(mixer);
}

async function show(pack: AssetPack): Promise<void> {
  const ids = (Object.keys(ASSETS) as AssetId[]).filter((id) => ASSETS[id].pack === pack);
  const extra: AssetId[] = pack === "characters" ? ["animations/Rig_Medium_General", "animations/Rig_Medium_MovementBasic", "items/axe_1handed"] : [];
  const t0 = performance.now();
  await lib.load([...ids, ...extra], (d, t) => (info.textContent = `Chargement ${d}/${t}…`));

  shown.clear();
  mixers = [];
  pickables = [];
  const visible = ids.filter((id) => ASSETS[id].kind !== "animation");
  const cols = Math.ceil(Math.sqrt(visible.length));
  const cell = Math.max(...visible.map((id) => Math.max(ASSETS[id].size.x, ASSETS[id].size.z) * PACK_SCALE[pack]), 1) + 1;
  visible.forEach((id, i) => {
    const obj = lib.create(id);
    obj.position.set((i % cols) * cell, 0, Math.floor(i / cols) * cell);
    obj.userData.assetId = id;
    shown.add(obj);
    pickables.push(obj);
    animate(obj, id);
  });
  if (pack === "characters" && pickables[0]) lib.attach(pickables[0], lib.create("items/axe_1handed"));

  const span = cols * cell;
  controls.target.set(span / 2 - cell / 2, 0, span / 2 - cell / 2);
  viewSize = Math.max(6, span * 0.6);
  resize();
  controls.update();
  const animList = ids.filter((id) => ASSETS[id].kind === "animation").map((id) => `${ASSETS[id].name} : ${ASSETS[id].clips.join(", ")}`);
  info.innerHTML =
    `<b>${PACKS[pack].credit}</b><br>${visible.length} modèles en ${Math.round(performance.now() - t0)} ms · grille = tuiles de 2 m` +
    (animList.length ? `<br><small>${animList.join("<br>")}</small>` : "") +
    `<br>Clic-glisser : tourner · molette : zoom`;
}

for (const pack of Object.keys(PACKS) as AssetPack[]) {
  if (pack === "animations") continue;
  select.add(new Option(`${pack} — ${PACKS[pack].credit}`, pack));
}
select.addEventListener("change", () => void show(select.value as AssetPack));

const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
addEventListener("pointermove", (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  let o: THREE.Object3D | null = ray.intersectObjects(pickables, true)[0]?.object ?? null;
  while (o && !o.userData.assetId) o = o.parent;
  if (!o) return;
  const a = ASSETS[o.userData.assetId as AssetId];
  label.textContent = `${a.id} · ${a.category} · ${a.size.x}×${a.size.z} u, h ${a.size.y} u${a.clips.length ? ` · ${a.clips.length} clips` : ""} — ${a.usage}`;
});

// Débogage depuis la console : __preview.scene, __preview.renderer.info…
(window as unknown as { __preview: object }).__preview = { THREE, scene, renderer, camera, lib };

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  for (const m of mixers) m.update(dt);
  controls.update();
  renderer.render(scene, camera);
});

await show((new URLSearchParams(location.search).get("pack") as AssetPack) ?? "nature");
select.value = new URLSearchParams(location.search).get("pack") ?? "nature";
