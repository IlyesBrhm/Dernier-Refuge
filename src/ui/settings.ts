// Panneau « Paramètres » (docs/design/ui-polish.md §1.5) : onglets Affichage · Son · Accessibilité,
// réglages appliqués immédiatement. L'UI lit des valeurs fournies par l'app et émet des patchs ; elle
// ne touche pas au stockage (l'app enregistre via src/app/prefs-controller.ts).

import { createDialog, type DialogView } from "./dialog";
import { createSegmented, createSlider, createSwitch, createTabs } from "./widgets";

export type QualityChoice = "low" | "medium" | "high";
export type MotionChoice = "system" | "on" | "off";

export interface SettingsValues {
  /** Qualité effective affichée (défaut de l'appareil si aucun choix). */
  quality: QualityChoice;
  fullscreen: boolean;
  fullscreenAvailable: boolean;
  muted: boolean;
  sfxVolume: number;
  ambienceVolume: number;
  reducedMotion: MotionChoice;
}

export interface SettingsCallbacks {
  onBack(): void;
  onQuality(q: QualityChoice): void;
  onFullscreen(on: boolean): void;
  onMuted(muted: boolean): void;
  onSfxVolume(v: number): void;
  /** Relâchement du curseur des effets : clic d'essai. */
  onSfxTest(): void;
  onAmbienceVolume(v: number): void;
  onReducedMotion(m: MotionChoice): void;
}

export interface SettingsPanel {
  readonly view: DialogView;
  open(): void;
  close(): void;
  setCovered(c: boolean): void;
  set(values: SettingsValues): void;
}

export function createSettingsPanel(container: HTMLElement, cb: SettingsCallbacks): SettingsPanel {
  const tabs = createTabs(["Affichage", "Son", "Accessibilité"], "settings");
  const view = createDialog(container, {
    id: "settings",
    title: "Paramètres",
    onBack: () => cb.onBack(),
    initialFocus: () => tabs.list.querySelector<HTMLElement>('[aria-selected="true"]'),
  });

  const [display, sound, access] = tabs.panels as [HTMLElement, HTMLElement, HTMLElement];

  const quality = createSegmented<QualityChoice>(
    "Qualité graphique",
    [
      { value: "low", label: "Bas" },
      { value: "medium", label: "Moyen" },
      { value: "high", label: "Haut" },
    ],
    (q) => cb.onQuality(q),
  );
  const fullscreen = createSwitch("Plein écran", (on) => cb.onFullscreen(on));
  display.append(quality.field, fullscreen.row);

  const mute = createSwitch("Couper le son", (on) => cb.onMuted(on));
  const sfx = createSlider("Volume des effets", (v) => cb.onSfxVolume(v), () => cb.onSfxTest());
  const amb = createSlider("Volume de l'ambiance", (v) => cb.onAmbienceVolume(v));
  sound.append(mute.row, sfx.field, amb.field);

  const motion = createSegmented<MotionChoice>(
    "Réduire les animations",
    [
      { value: "system", label: "Système" },
      { value: "on", label: "Activé" },
      { value: "off", label: "Désactivé" },
    ],
    (m) => cb.onReducedMotion(m),
  );
  access.append(motion.field);

  view.body.append(tabs.list, ...tabs.panels);

  return {
    view,
    open(): void {
      tabs.select(0);
      view.open();
    },
    close: () => view.close(),
    setCovered: (c) => view.setCovered(c),
    set(v: SettingsValues): void {
      quality.set(v.quality);
      fullscreen.set(v.fullscreen && v.fullscreenAvailable);
      fullscreen.setEnabled(v.fullscreenAvailable, v.fullscreenAvailable ? null : "Indisponible sur cet appareil");
      mute.set(v.muted);
      sfx.set(v.sfxVolume);
      amb.set(v.ambienceVolume);
      motion.set(v.reducedMotion);
    },
  };
}
