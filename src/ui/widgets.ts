// Contrôles de formulaire du guide (ui-style.md §5) : interrupteur, curseur, choix segmenté, onglets.
// Accessibles au clavier (Entrée / Espace, flèches, Début / Fin), état jamais porté par la couleur seule
// (icône `check` sur l'état actif / sélectionné).

import { icon } from "./icons";

let uid = 0;
const nextId = (p: string): string => `${p}-${++uid}`;

// --- Interrupteur ---------------------------------------------------------------------------------

export interface SwitchControl {
  readonly row: HTMLElement;
  readonly button: HTMLButtonElement;
  set(on: boolean): void;
  setEnabled(enabled: boolean, reason?: string | null): void;
}

export function createSwitch(label: string, onToggle: (next: boolean) => void): SwitchControl {
  const row = document.createElement("div");
  row.className = "switch-row";
  const labelEl = document.createElement("span");
  labelEl.className = "switch-row__label";
  labelEl.id = nextId("switch-label");
  labelEl.textContent = label;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "switch";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-checked", "false");
  button.setAttribute("aria-labelledby", labelEl.id);
  const track = document.createElement("span");
  track.className = "switch__track";
  const thumb = document.createElement("span");
  thumb.className = "switch__thumb";
  thumb.appendChild(icon("check", 16));
  track.appendChild(thumb);
  button.appendChild(track);
  const note = document.createElement("p");
  note.className = "field__note";
  note.id = nextId("switch-note");
  note.hidden = true;
  const wrap = document.createElement("div");
  wrap.className = "field";
  row.append(labelEl, button);
  wrap.append(row, note);

  let on = false;
  let enabled = true;
  const toggle = (): void => {
    if (!enabled) return;
    onToggle(!on);
  };
  button.addEventListener("click", toggle);
  labelEl.addEventListener("click", toggle);

  return {
    row: wrap,
    button,
    set(next: boolean): void {
      on = next;
      const v = String(next);
      if (button.getAttribute("aria-checked") !== v) button.setAttribute("aria-checked", v);
    },
    setEnabled(e: boolean, reason?: string | null): void {
      enabled = e;
      button.setAttribute("aria-disabled", e ? "false" : "true");
      note.textContent = e ? "" : (reason ?? "");
      note.hidden = e || !reason;
      if (!e && reason) button.setAttribute("aria-describedby", note.id);
      else button.removeAttribute("aria-describedby");
    },
  };
}

// --- Curseur --------------------------------------------------------------------------------------

export interface SliderControl {
  readonly field: HTMLElement;
  readonly input: HTMLInputElement;
  set(value: number): void;
}

/** Curseur 0–100 %, pas de 5. `onInput` à chaque mouvement, `onCommit` au relâchement. */
export function createSlider(
  label: string,
  onInput: (value: number) => void,
  onCommit?: (value: number) => void,
): SliderControl {
  const field = document.createElement("div");
  field.className = "field";
  const row = document.createElement("div");
  row.className = "field__row";
  const labelEl = document.createElement("label");
  labelEl.className = "field__label";
  const input = document.createElement("input");
  input.type = "range";
  input.className = "slider";
  input.min = "0";
  input.max = "100";
  input.step = "5";
  input.id = nextId("slider");
  labelEl.htmlFor = input.id;
  labelEl.textContent = label;
  const out = document.createElement("span");
  out.className = "field__value";
  out.setAttribute("aria-hidden", "true");
  row.append(labelEl, out);
  field.append(row, input);

  function show(v: number): void {
    const text = `${v} %`;
    if (out.textContent !== text) out.textContent = text;
    input.setAttribute("aria-valuetext", text);
    input.style.setProperty("--fill", `${v}%`);
  }
  const read = (): number => Math.max(0, Math.min(100, Math.round(Number(input.value) / 5) * 5));
  input.addEventListener("input", () => {
    const v = read();
    show(v);
    onInput(v);
  });
  input.addEventListener("change", () => onCommit?.(read()));

  return {
    field,
    input,
    set(v: number): void {
      const s = String(v);
      if (input.value !== s) input.value = s;
      show(v);
    },
  };
}

// --- Choix segmenté -------------------------------------------------------------------------------

export interface SegmentedControl<T extends string> {
  readonly field: HTMLElement;
  set(value: T): void;
}

export function createSegmented<T extends string>(
  label: string,
  options: readonly { value: T; label: string }[],
  onChange: (value: T) => void,
): SegmentedControl<T> {
  const field = document.createElement("div");
  field.className = "field";
  const labelEl = document.createElement("span");
  labelEl.className = "field__label";
  labelEl.id = nextId("seg-label");
  labelEl.textContent = label;
  const group = document.createElement("div");
  group.className = "segmented";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-labelledby", labelEl.id);
  const buttons = options.map((o) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "segmented__option";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", "false");
    b.dataset.value = o.value;
    const check = icon("check", 16);
    const text = document.createElement("span");
    text.textContent = o.label;
    b.append(check, text);
    b.addEventListener("click", () => onChange(o.value));
    return b;
  });
  group.append(...buttons);
  field.append(labelEl, group);

  let current: T | null = null;
  group.addEventListener("keydown", (e) => {
    const i = buttons.findIndex((b) => b === document.activeElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % buttons.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + buttons.length) % buttons.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = buttons.length - 1;
    if (j < 0) return;
    e.preventDefault();
    const o = options[j];
    buttons[j]?.focus();
    if (o) onChange(o.value);
  });

  return {
    field,
    set(value: T): void {
      if (value === current) return;
      current = value;
      buttons.forEach((b) => {
        const sel = b.dataset.value === value;
        b.setAttribute("aria-checked", String(sel));
        b.tabIndex = sel ? 0 : -1;
        const svg = b.querySelector("svg");
        if (svg) svg.style.display = sel ? "" : "none";
      });
    },
  };
}

// --- Onglets --------------------------------------------------------------------------------------

export interface TabsControl {
  readonly list: HTMLElement;
  readonly panels: HTMLElement[];
  select(index: number, focus?: boolean): void;
  selected(): number;
}

export function createTabs(labels: readonly string[], idPrefix: string): TabsControl {
  const list = document.createElement("div");
  list.className = "tabs";
  list.setAttribute("role", "tablist");
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];
  labels.forEach((label, i) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.setAttribute("role", "tab");
    tab.id = `${idPrefix}-tab-${i}`;
    tab.textContent = label;
    const panel = document.createElement("div");
    panel.className = "tab-panel";
    panel.setAttribute("role", "tabpanel");
    panel.id = `${idPrefix}-panel-${i}`;
    panel.setAttribute("aria-labelledby", tab.id);
    tab.setAttribute("aria-controls", panel.id);
    tab.addEventListener("click", () => select(i));
    tabs.push(tab);
    panels.push(panel);
  });
  list.append(...tabs);
  let current = -1;

  function select(i: number, focus = false): void {
    const n = Math.max(0, Math.min(tabs.length - 1, i));
    current = n;
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", String(k === n));
      t.tabIndex = k === n ? 0 : -1;
    });
    panels.forEach((p, k) => (p.hidden = k !== n));
    if (focus) tabs[n]?.focus();
  }

  list.addEventListener("keydown", (e) => {
    const i = tabs.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    if (j < 0) return;
    e.preventDefault();
    select(j, true);
  });

  select(0);
  return { list, panels, select, selected: () => current };
}
