// Moteur de sons procéduraux Web Audio (docs/design/ui-polish.md §4.7) : aucun fichier, tout est
// synthétisé. Graphe : sfxBus et ambienceBus → master → destination.
// - AudioContext créé au premier geste (pointerdown / pointerup / touchend / keydown) ou par `unlock()`
//   (clic Continuer / Nouvelle partie) ; `resume()` si suspendu ; onglet caché ⇒ `suspend()`.
// - Sans AudioContext (ou création qui lève) : moteur silencieux (mêmes méthodes, aucun effet).
// - Aucune fuite : boucles créées une fois ; chaque son ponctuel se déconnecte à la fin (`onended`).
// - Aucun Math.random : bruit généré par un xorshift seedé, variations par compteur.
// Lit seulement des paramètres (préférences, scène, ambiance) : ne touche jamais à l'état du jeu.

import { AUDIO, type AmbienceParams, type AudioPrefs, type AudioScene, type SfxId } from "./audio-config";
import { busGains, loopGains, popPitch } from "./audio-mix";

export interface AudioEngine {
  /** false si Web Audio est absent ou a échoué : toutes les méthodes restent sans effet. */
  readonly supported: boolean;
  /** Crée / reprend l'AudioContext. À appeler dans un geste utilisateur ; idempotent. */
  unlock(): void;
  /** Contexte créé (premier geste reçu). */
  isStarted(): boolean;
  /** Muet + volumes (rampes de 150 ms). Appelable avant `unlock` (mémorisé). */
  setPrefs(prefs: AudioPrefs): void;
  /** Titre (feu 0,7 et vent 0,5 fixes), jeu, pause (ambiance × 0,35). */
  setScene(scene: AudioScene): void;
  /** Paramètres continus (par image) : distance au feu, bois, nuit. Re-planifié seulement s'il change. */
  setAmbience(params: AmbienceParams): void;
  /** Effet ponctuel (ignoré avant le premier geste, si muet, ou au-delà de AUDIO.maxVoices). */
  play(id: SfxId): void;
  /**
   * Clic sonore sur les boutons d'un conteneur (délégation : button, [role=switch|tab|radio], a[href],
   * hors désactivés). Renvoie la fonction de retrait de l'écouteur.
   */
  bindClicks(root: HTMLElement): () => void;
  /** Arrête tout, déconnecte les nœuds, ferme le contexte, retire les écouteurs. */
  dispose(): void;
}

export interface AudioOptions {
  /** Fenêtre (tests) ; défaut : `window`. */
  win?: Window;
  /** Écoute les premiers gestes sur la fenêtre pour démarrer le contexte (défaut : true). */
  autoUnlock?: boolean;
  /** Préférences initiales (défaut : son actif, 80 / 60). */
  prefs?: AudioPrefs;
  scene?: AudioScene;
}

type AudioContextCtor = new () => AudioContext;

/** xorshift32 déterministe → [−1, 1). */
function noiseGen(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0x100000000) * 2 - 1;
  };
}

function findAudioContext(win: Window): AudioContextCtor | null {
  const w = win as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Moteur sans effet (Web Audio indisponible). */
function silentEngine(): AudioEngine {
  return {
    supported: false,
    unlock() {},
    isStarted: () => false,
    setPrefs() {},
    setScene() {},
    setAmbience() {},
    play() {},
    bindClicks: () => () => {},
    dispose() {},
  };
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  ambienceBus: GainNode;
  fireOut: GainNode;
  windOut: GainNode;
  /** Bruit blanc partagé (crépitement de fond, bruit de la construction). */
  white: AudioBuffer;
  /** Tous les nœuds permanents (pour dispose). */
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

const CLICK_SELECTOR = 'button, [role="switch"], [role="tab"], [role="radio"], a[href]';

export function createAudio(opts: AudioOptions = {}): AudioEngine {
  const win = opts.win ?? (typeof window === "undefined" ? null : window);
  if (!win) return silentEngine();
  const found = findAudioContext(win);
  if (!found) return silentEngine();
  const Ctor: AudioContextCtor = found;
  const doc = win.document;

  let prefs: AudioPrefs = opts.prefs ?? { muted: false, sfxVolume: 80, ambienceVolume: 60 };
  let scene: AudioScene = opts.scene ?? "title";
  let ambience: AmbienceParams = { fireDistanceTiles: Infinity, fireWood: 0, fireCapacity: 1, nightness: 0 };
  let graph: Graph | null = null;
  let failed = false;
  let disposed = false;
  let voices = 0;
  let popCount = 0;
  /** Dernière cible planifiée par paramètre (évite de re-planifier 60 fois par seconde). */
  const targets = new WeakMap<AudioParam, number>();

  function ramp(ctx: AudioContext, param: AudioParam, value: number, force = false): void {
    const last = targets.get(param);
    if (!force && last !== undefined && Math.abs(last - value) < AUDIO.epsilon) return;
    targets.set(param, value);
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + AUDIO.rampS);
  }

  function applyGains(force = false): void {
    if (!graph) return;
    const { ctx } = graph;
    const b = busGains(prefs, scene);
    ramp(ctx, graph.master.gain, b.master, force);
    ramp(ctx, graph.sfxBus.gain, b.sfx, force);
    ramp(ctx, graph.ambienceBus.gain, b.ambience, force);
    const l = loopGains(ambience, scene);
    ramp(ctx, graph.fireOut.gain, l.fire, force);
    ramp(ctx, graph.windOut.gain, l.wind, force);
  }

  function makeBuffer(ctx: AudioContext, seconds: number, fill: (data: Float32Array, rate: number) => void): AudioBuffer {
    const rate = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.max(1, Math.round(seconds * rate)), rate);
    fill(buf.getChannelData(0), rate);
    return buf;
  }

  function buildGraph(ctx: AudioContext): Graph {
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const gain = (value: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = value;
      nodes.push(g);
      return g;
    };
    const master = gain(0);
    master.connect(ctx.destination);
    const sfxBus = gain(0);
    sfxBus.connect(master);
    const ambienceBus = gain(0);
    ambienceBus.connect(master);

    // Bruit blanc 2 s (généré une fois).
    const white = makeBuffer(ctx, AUDIO.fire.noiseS, (d) => {
      const rnd = noiseGen(0x6669_7265);
      for (let i = 0; i < d.length; i++) d[i] = rnd();
    });

    // --- Crépitement : bruit blanc → passe-bande 1,5 kHz (souffle) + craquements (impulsions planifiées
    // toutes les 30 à 200 ms, précalculées dans une boucle de 5,3 s : aucune création de nœud par craquement).
    const fireOut = gain(0);
    fireOut.connect(ambienceBus);
    const hiss = ctx.createBufferSource();
    hiss.buffer = white;
    hiss.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = AUDIO.fire.bandHz;
    band.Q.value = AUDIO.fire.bandQ;
    const hissLevel = gain(AUDIO.level.fireHiss);
    hiss.connect(band).connect(hissLevel).connect(fireOut);
    nodes.push(band);
    sources.push(hiss);

    const crackleBuf = makeBuffer(ctx, AUDIO.fire.crackleS, (d, rate) => {
      const rnd = noiseGen(0x6372_6b6c);
      const unit = (): number => (rnd() + 1) / 2;
      let t = AUDIO.fire.crackleMinS;
      while (t < AUDIO.fire.crackleS - 0.02) {
        const start = Math.floor(t * rate);
        const len = Math.floor((0.002 + 0.006 * unit()) * rate);
        const amp = 0.3 + 0.7 * unit();
        for (let i = 0; i < len && start + i < d.length; i++) {
          const env = Math.exp((-6 * i) / len);
          d[start + i] = (d[start + i] ?? 0) + rnd() * amp * env;
        }
        t += AUDIO.fire.crackleMinS + (AUDIO.fire.crackleMaxS - AUDIO.fire.crackleMinS) * unit();
      }
    });
    const crackle = ctx.createBufferSource();
    crackle.buffer = crackleBuf;
    crackle.loop = true;
    const crackleLevel = gain(AUDIO.level.fireCrackle);
    crackle.connect(crackleLevel).connect(fireOut);
    sources.push(crackle);

    // --- Vent : bruit brun (boucle 4 s, raccord en fondu) → passe-bas 400 Hz, modulé par un LFO 0,1 Hz.
    const windOut = gain(0);
    windOut.connect(ambienceBus);
    const brownBuf = makeBuffer(ctx, AUDIO.wind.noiseS, (d, rate) => {
      const rnd = noiseGen(0x7769_6e64);
      const fade = Math.floor(0.25 * rate);
      const raw = new Float32Array(d.length + fade);
      let last = 0;
      for (let i = 0; i < raw.length; i++) {
        last = (last + 0.02 * rnd()) / 1.02;
        raw[i] = last * 3.5;
      }
      for (let i = 0; i < d.length; i++) {
        const v = raw[i] ?? 0;
        if (i < fade) {
          const k = i / fade;
          d[i] = v * k + (raw[d.length + i] ?? 0) * (1 - k);
        } else d[i] = v;
      }
    });
    const wind = ctx.createBufferSource();
    wind.buffer = brownBuf;
    wind.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = AUDIO.wind.lowpassHz;
    const windMod = gain(1 - AUDIO.wind.lfoDepth);
    const windLevel = gain(AUDIO.level.wind);
    wind.connect(low).connect(windMod).connect(windLevel).connect(windOut);
    nodes.push(low);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = AUDIO.wind.lfoHz;
    const lfoDepth = gain(AUDIO.wind.lfoDepth);
    lfo.connect(lfoDepth).connect(windMod.gain);
    sources.push(wind, lfo);

    for (const s of sources) s.start();
    return { ctx, master, sfxBus, ambienceBus, fireOut, windOut, white, nodes, sources };
  }

  function unlock(): void {
    if (disposed || failed) return;
    if (!graph) {
      try {
        const ctx = new Ctor();
        graph = buildGraph(ctx);
      } catch (e) {
        failed = true;
        graph = null;
        if (import.meta.env.DEV) console.warn("[audio] Web Audio indisponible : sons désactivés", e);
        return;
      }
      applyGains(true);
    }
    const ctx = graph.ctx;
    if (ctx.state === "suspended" && !doc.hidden) ctx.resume().catch(() => {});
  }

  /** Enveloppe percussive sur un gain : 0 → peak en `attack`, puis décroissance exponentielle. */
  function envelope(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** Une voix ponctuelle : déconnecte ses nœuds quand sa DERNIÈRE source se termine. */
  function voice(sources: AudioScheduledSourceNode[], others: AudioNode[]): void {
    voices++;
    let left = sources.length;
    const done = (): void => {
      left--;
      if (left > 0) return;
      for (const s of sources) s.disconnect();
      for (const n of others) n.disconnect();
      voices = Math.max(0, voices - 1);
    };
    for (const s of sources) s.onended = done;
  }

  function play(id: SfxId): void {
    const g = graph;
    if (!g || disposed || prefs.muted || g.ctx.state !== "running") return;
    if (voices >= AUDIO.maxVoices) return;
    const { ctx } = g;
    const t = ctx.currentTime + 0.005;
    try {
      if (id === "pop") {
        const p = AUDIO.pop;
        const k = popPitch(popCount++);
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(p.fromHz * k, t);
        osc.frequency.exponentialRampToValueAtTime(p.toHz * k, t + p.sweepS);
        const env = ctx.createGain();
        envelope(env, t, AUDIO.level.pop, p.attackS, p.decayS);
        osc.connect(env).connect(g.sfxBus);
        osc.start(t);
        osc.stop(t + p.attackS + p.decayS + 0.02);
        voice([osc], [env]);
      } else if (id === "click") {
        const c = AUDIO.click;
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(c.hz, t);
        const env = ctx.createGain();
        envelope(env, t, AUDIO.level.click, 0.002, c.durS);
        osc.connect(env).connect(g.sfxBus);
        osc.start(t);
        osc.stop(t + c.durS + 0.01);
        voice([osc], [env]);
      } else {
        const b = AUDIO.build;
        const sources: AudioScheduledSourceNode[] = [];
        const others: AudioNode[] = [];
        b.notesHz.forEach((hz, i) => {
          const at = t + i * b.noteS;
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(hz, at);
          const env = ctx.createGain();
          envelope(env, at, AUDIO.level.build, 0.005, b.noteS);
          osc.connect(env).connect(g.sfxBus);
          osc.start(at);
          osc.stop(at + b.noteS + 0.02);
          sources.push(osc);
          others.push(env);
        });
        const noise = ctx.createBufferSource();
        noise.buffer = g.white;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = b.noiseLowpassHz;
        const env = ctx.createGain();
        envelope(env, t, AUDIO.level.buildNoise, 0.002, b.noiseS);
        noise.connect(lp).connect(env).connect(g.sfxBus);
        noise.start(t, 0, b.noiseS + 0.01);
        sources.push(noise);
        others.push(lp, env);
        voice(sources, others);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[audio] effet ignoré", e);
    }
  }

  // --- Écouteurs : premier geste, visibilité ---
  const onGesture = (): void => {
    if (graph && graph.ctx.state === "running") return;
    unlock();
  };
  const gestureEvents = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
  const autoUnlock = opts.autoUnlock !== false;
  if (autoUnlock) {
    for (const e of gestureEvents) win.addEventListener(e, onGesture, { capture: true, passive: true });
  }
  const onVisibility = (): void => {
    if (!graph) return;
    const ctx = graph.ctx;
    if (doc.hidden) {
      if (ctx.state === "running") ctx.suspend().catch(() => {});
    } else if (ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  doc.addEventListener("visibilitychange", onVisibility);

  return {
    supported: true,
    unlock,
    isStarted: () => graph !== null,
    setPrefs(next: AudioPrefs): void {
      prefs = { muted: next.muted, sfxVolume: next.sfxVolume, ambienceVolume: next.ambienceVolume };
      applyGains();
    },
    setScene(next: AudioScene): void {
      scene = next;
      applyGains();
    },
    setAmbience(next: AmbienceParams): void {
      ambience = next;
      if (scene !== "title") applyGains();
    },
    play,
    bindClicks(root: HTMLElement): () => void {
      const onClick = (e: Event): void => {
        const el = e.target instanceof Element ? e.target.closest(CLICK_SELECTOR) : null;
        if (!el || !root.contains(el)) return;
        if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
        play("click");
      };
      root.addEventListener("click", onClick);
      return () => root.removeEventListener("click", onClick);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (autoUnlock) {
        for (const e of gestureEvents) win.removeEventListener(e, onGesture, { capture: true });
      }
      doc.removeEventListener("visibilitychange", onVisibility);
      const g = graph;
      graph = null;
      if (!g) return;
      for (const s of g.sources) {
        try {
          s.stop();
        } catch {
          // déjà arrêtée
        }
        s.disconnect();
      }
      for (const n of g.nodes) n.disconnect();
      g.ctx.close().catch(() => {});
    },
  };
}
