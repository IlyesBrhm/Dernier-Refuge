// Sérialisation canonique : même valeur ⇒ même chaîne, quel que soit l'ordre d'insertion des clés.
// Base du checksum et du texte stocké (docs/design/save.md §3).

import { SAVE_CONFIG } from "./config";

export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * JSON canonique : clés d'objet triées (ordre des code units UTF-16), tableaux dans l'ordre, pas
 * d'espaces. LÈVE `CanonicalError` sur : NaN, ±Infinity, nombre hors des entiers sûrs en valeur absolue
 * (> 2^53-1), `undefined`, fonction, symbole, bigint, objet non plain (Date, Map, classe…), profondeur
 * d'imbrication > `maxDepth` (protège aussi des cycles). Les nombres non entiers finis (1.5) passent :
 * c'est le schéma qui les refuse, avec une erreur plus précise.
 */
export function canonicalStringify(value: unknown, maxDepth: number = SAVE_CONFIG.maxDepth): string {
  const out: string[] = [];
  write(value, 0, "$");
  return out.join("");

  function write(v: unknown, depth: number, path: string): void {
    if (v === null) {
      out.push("null");
      return;
    }
    switch (typeof v) {
      case "string":
        out.push(JSON.stringify(v));
        return;
      case "boolean":
        out.push(v ? "true" : "false");
        return;
      case "number":
        if (!Number.isFinite(v)) throw new CanonicalError(`${path}: nombre non fini (${String(v)})`);
        if (Math.abs(v) > Number.MAX_SAFE_INTEGER) throw new CanonicalError(`${path}: nombre non sûr (${v})`);
        out.push(JSON.stringify(v));
        return;
      case "object":
        break;
      default:
        throw new CanonicalError(`${path}: type non sérialisable (${typeof v})`);
    }
    const d = depth + 1;
    if (d > maxDepth) throw new CanonicalError(`${path}: profondeur > ${maxDepth}`);
    if (Array.isArray(v)) {
      out.push("[");
      for (let i = 0; i < v.length; i++) {
        if (i > 0) out.push(",");
        write(v[i], d, `${path}[${i}]`);
      }
      out.push("]");
      return;
    }
    if (!isPlainObject(v)) throw new CanonicalError(`${path}: objet non plain`);
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    out.push("{");
    keys.forEach((k, i) => {
      if (i > 0) out.push(",");
      out.push(JSON.stringify(k), ":");
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      if (!desc || !("value" in desc)) throw new CanonicalError(`${path}.${k}: accesseur refusé`);
      write(desc.value, d, `${path}.${k}`);
    });
    out.push("}");
  }
}
