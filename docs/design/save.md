# Design — Sauvegarde fiable et anti-triche (Jalon 2)

Statut : implémenté (écarts et limites : §10). Branche : `feature/save` (basée sur `feature/harvest`).
Prolonge `docs/design/core-loop.md` et `docs/design/harvest.md` (implémentés). Skill de référence :
`.claude/skills/save-anticheat/SKILL.md` (on s'en écarte sur 3 points, signalés : autosave 10 s, hash synchrone,
pas d'offline ni de détection d'horloge).

Hors périmètre : progression hors ligne, détection d'horloge trafiquée, sauvegarde en ligne, IndexedDB.

---

## 1. Règles

1. **Autosave** toutes les `SAVE_CONFIG.autosaveIntervalMs` (10 000 ms réelles), à `visibilitychange` → `hidden`
   et à `pagehide`. Pas de `beforeunload` (casse le bfcache sur certains navigateurs ; `pagehide` + `hidden`
   couvrent fermeture, changement d'onglet et mise en arrière-plan mobile). Une sauvegarde est sautée si l'état
   courant est **la même référence** que le dernier état sauvegardé avec succès.
2. **Reprise exacte** : l'état rechargé est `toEqual` à l'état sauvegardé (y compris `rng`, `tick`,
   `commandsThisTick`, `player.input`). Le chargement n'appelle **jamais** `tick()` : le temps page fermée ne compte
   pas ; `savedAt` est informatif (jamais lu par le gameplay).
3. **Format** (texte JSON canonique) :
   ```ts
   interface SaveFileV1 { version: 1; savedAt: number; seed: number; checksum: string; state: SavedStateV1 }
   ```
4. **Double slot A/B** : on écrit le slot **non courant**, on le relit, on le décode entièrement (checksum + forme +
   invariants), et seulement ensuite le pointeur `current` bascule dessus.
5. **Chargement** : slot `current` s'il est valide, sinon l'autre. Si aucun pointeur lisible : le plus grand `savedAt`
   (égalité ⇒ A). Aucun slot valide (et au moins un non vide) ⇒ mise en quarantaine des données abîmées, puis
   nouvelle partie et message « Sauvegarde endommagée, nouvelle partie lancée ». Aucun slot du tout ⇒ nouvelle
   partie silencieuse.
6. **Toute donnée abîmée non vide est mise en quarantaine avant d'être écrasée**, y compris un seul slot abîmé quand
   l'autre est valide (il serait sinon écrasé à la prochaine autosave).
7. **Version future** (un slot quelconque a `version > CURRENT_VERSION`) ⇒ rien n'est chargé ni écrasé : partie
   temporaire, **autosave désactivée**, message. On ne retombe pas sur un slot plus ancien (évite un retour en arrière
   silencieux qui écraserait ensuite les données récentes).
8. **Validation avant usage** : taille → JSON → enveloppe → version → checksum → migrations → forme stricte → invariants
   du core. Un état invalide est **rejeté, jamais réparé**.
9. **Nouvelle partie / import** : après confirmation, le nouvel état est écrit **deux fois** (A puis B) pour que le
   repli « autre slot » ne ressuscite jamais l'ancienne partie.
10. **Multi-onglets** : un seul onglet propriétaire écrit. L'autre est jouable (il charge la sauvegarde en lecture seule),
    n'écrit rien et affiche un message. Quand le propriétaire se ferme, l'autre prend le verrou, **recharge la sauvegarde
    depuis le stockage** (sa partie locale non sauvegardée est abandonnée) et affiche « Partie reprise ».
11. **Stockage indisponible / plein** : le jeu continue, bandeau « Sauvegarde indisponible ». Après une erreur de quota,
    l'autosave réessaie à l'intervalle suivant ; le bandeau disparaît au premier succès. Export toujours possible.
12. **Seed** : celle de l'enveloppe est une métadonnée (export, débogage). La vérité est `state.rng`. Le seed n'est
    jamais utilisé pour recalculer le RNG. Nouvelle partie : `?seed=` si présent, sinon seed aléatoire
    (`crypto.getRandomValues`, dans `src/app`).

---

## 2. Changements d'état

**`GameState` ne change pas de forme.** Pas de nouveau champ, pas de migration à écrire maintenant ; la forme actuelle
(avec `nodes` et `Drop.resource`) devient la **v1**. `CURRENT_VERSION = 1`.

Ce qui est sérialisé — `SavedStateV1 = Omit<GameState, "map">` :
- **`map` n'est pas sérialisée** : statique, dérivable de `MAP_LAYOUT`, déjà comparée à la référence par les invariants.
  Au chargement : `state = { ...saved, map: referenceMap() }`. Gain : taille, surface d'attaque, une seule source de vérité.
  Conséquence : **tout changement de `MAP_LAYOUT`, `BUILD.slotCosts` ou des nœuds ⇒ nouvelle version de save + migration**
  (la fixture v1 le détecte : ses nœuds/slots ne correspondraient plus).
- **`commandsThisTick` et `player.input` sont sérialisés tels quels** (aucune remise à zéro). Raison : seule façon d'avoir
  « même suite de jeu avec ou sans rechargement » au niveau core quand la sauvegarde tombe entre une commande et le tick
  suivant. Côté app, après rechargement, l'`InputController` relit les touches réelles et envoie `setMoveInput(0,0)` au
  premier frame si besoin : c'est une commande normale, comme un relâchement de touche.
- `seed` reste **hors** de `GameState` (dans l'enveloppe seulement).

Changement du core (pas de forme) : `core-dev` exporte `referenceMap(): MapState` (mémoïsé, `parseMap(MAP_LAYOUT).map`,
`Object.freeze` profond) et l'utilise dans `createInitialState` (une seule instance de carte partout).

---

## 3. API de `src/save` (aucune commande de jeu nouvelle)

Pas de nouvelle `Command` core : charger/importer/nouvelle partie **remplacent** l'état par un état validé, ce n'est pas
une mutation de gameplay. Pas de nouveau système de tick.

### Modules
| Fichier | Contenu |
|---|---|
| `config.ts` | `CURRENT_VERSION`, `SALT`, clés, tailles, bornes de tableaux, timings (cf. §7) |
| `canonical.ts` | `canonicalStringify(v, maxDepth): string` — clés triées (ordre des code units), tableaux dans l'ordre, nombres via `JSON.stringify` mais **lève** sur NaN/±Infinity/non-sûr, `undefined`, fonction, objet non plain, profondeur > `maxDepth` |
| `hash.ts` | `hash64(s: string): string` — cyrb53 étendu, deux mots 32 bits ⇒ 16 hex. Synchrone (requis pour `pagehide`), sans dépendance. **Gelé pour v1.** |
| `schema.ts` | Mini-validateur écrit à la main : `int(min,max)`, `literal`, `oneOf`, `nullable`, `obj(shape)` **strict** (clé manquante ou inconnue = erreur, `Object.hasOwn`, `__proto__` refusé), `arr(item, maxLen)`. `validateSavedStateV1(raw): string[]` (chemins type `survivors[3].pos.x`) |
| `codec.ts` | `encodeSave`, `decodeSave` (§3.1) |
| `migrations.ts` | `migrations: Record<number, (raw: unknown) => unknown>` (vide en v1), `migrate(raw, from, { registry, target })` |
| `storage.ts` | `StorageAdapter`, `createMemoryStorage(opts)`, `createLocalStorageAdapter(win)` |
| `slots.ts` | `writeSave`, `commitFresh`, `loadGame`, `quarantine`, `listQuarantine` |
| `lock.ts` | `createLeaseLock` (pur, horloge injectée), `createWebLock(locks)`, interface `SaveLock` |
| `index.ts` | API publique |

`src/save` importe `src/core` (types, `checkInvariants`, `referenceMap`) et `src/data` ; jamais `app/ui/render`, jamais
`window`/`Date.now` directement (tout injecté).

### 3.1 Codec
```ts
type SavedStateV1 = Omit<GameState, "map">;
type DecodeError =
  | "too_large" | "empty" | "not_json" | "bad_envelope" | "unsupported_version" | "future_version"
  | "bad_checksum" | "migration_failed" | "bad_shape" | "invariants";
type DecodeResult =
  | { ok: true; state: GameState; seed: number; savedAt: number; version: number }
  | { ok: false; error: DecodeError; details: string[]; version?: number };

function encodeSave(state: GameState, meta: { seed: number; savedAt: number }):
  { ok: true; text: string } | { ok: false; error: "serialize_error" | "too_large"; details: string[] };
function decodeSave(text: unknown, opts?: { maxBytes?: number }): DecodeResult; // NE LÈVE JAMAIS (try/catch global)
```
`checksum = hash64(SALT + "\0" + version + "\0" + savedAt + "\0" + seed + "\0" + canonicalStringify(state))`.
Le fichier stocké/exporté = `canonicalStringify(envelope)` (export : même texte, pas d'indentation, pour rester
identique au stockage).

Ordre de `decodeSave` :
1. `typeof text === "string"`, `length === 0` ⇒ `empty`, `length > maxBytes` ⇒ `too_large`
   (l'état est 100 % ASCII — enums + entiers — donc longueur = octets ; tout caractère non ASCII est refusé par le schéma).
2. `JSON.parse` dans try ⇒ `not_json`.
3. Enveloppe stricte : objet plain avec exactement `version`, `savedAt`, `seed`, `checksum`, `state` ;
   `version` entier sûr, `savedAt` entier `[0, MAX_SAFE]`, `seed` entier `[0, 2^32-1]`, `checksum` `/^[0-9a-f]{16}$/`,
   `state` objet plain ⇒ sinon `bad_envelope`.
4. `version > CURRENT_VERSION` ⇒ `future_version` ; `version < 1` ⇒ `unsupported_version`.
5. Checksum recalculé sur l'état **tel que stocké** (avant migration ; `canonicalStringify` avec `maxDepth`
   ⇒ un JSON ultra-imbriqué lève, attrapé ⇒ `bad_checksum`) ⇒ sinon `bad_checksum`.
6. `migrate` jusqu'à `CURRENT_VERSION` (étape manquante ou exception ⇒ `migration_failed`).
7. `validateSavedStateV1` ⇒ `bad_shape` (bornes de taille + types + entiers sûrs ; pas de NaN/Infinity possibles après
   JSON mais refusés quand même si l'entrée vient d'ailleurs).
8. `state = { ...raw, map: referenceMap() }` puis `checkInvariants(state)` (dans try) ⇒ `invariants`.

### 3.2 Stockage
```ts
interface StorageAdapter {            // toutes les méthodes PEUVENT lever ; src/save attrape tout
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}
createMemoryStorage(opts?: { quotaChars?: number; failGet?: boolean; failSet?: "quota" | "security" | false;
                             corruptOnWrite?: (k: string, v: string) => string }): StorageAdapter;
createLocalStorageAdapter(win: { localStorage?: Storage }): StorageAdapter | null; // sonde set/remove, null si KO
```
Clés (préfixe `dernier-refuge.`) : `save.A`, `save.B`, `save.current` (`"A"|"B"`), `quarantine.<horodatage ms>-<n>`, `lock`.

### 3.3 Écriture — `writeSave(storage, state, meta, lock)`
```ts
type WriteError = "unavailable" | "quota" | "too_large" | "serialize_error" | "readback_mismatch" | "not_owner";
type WriteResult = { ok: true; slot: "A" | "B"; chars: number } | { ok: false; error: WriteError };
```
1. `lock.isOwner()` sinon `not_owner`. 2. `encodeSave`. 3. Cible = autre que `current` (`current` illisible ⇒ `A`).
4. `setItem(cible)` — `QuotaExceededError` (nom ou code 22/1014) ⇒ `quota`, autre exception ⇒ `unavailable`.
5. Relecture : texte identique **et** `decodeSave` ok ⇒ sinon `readback_mismatch` (pointeur inchangé).
6. `setItem(current, cible)` + relecture. Échec ⇒ erreur ; le pointeur vise toujours l'ancien slot, valide (perte ≤ 10 s).
`commitFresh` = `writeSave` deux fois (les deux slots contiennent le nouvel état).

### 3.4 Chargement — `loadGame(storage)` (lecture seule, ne lève jamais)
```ts
type SlotReport = { slot: "A" | "B"; kind: "empty" } | { slot: "A" | "B"; kind: "valid"; decoded: DecodeOk }
                | { slot: "A" | "B"; kind: "invalid"; error: DecodeError; raw: string };
type LoadResult =
  | { kind: "loaded"; state: GameState; seed: number; slot: "A" | "B"; damaged: SlotReport[] } // l'autre abîmé
  | { kind: "fresh" }                                          // aucun slot
  | { kind: "corrupt"; damaged: SlotReport[] }                 // aucun valide
  | { kind: "future"; version: number }                        // au moins un slot future_version
  | { kind: "unavailable" };                                   // storage null ou getItem lève
```
`quarantine(storage, damaged, now): boolean` (appelée par l'app, **onglet propriétaire seulement**) : écrit
`{ quarantinedAt, reports: [{ slot, error, raw }] }` sous une nouvelle clé (raw tronqué à `maxSaveChars`), relit,
puis supprime les plus anciennes au-delà de `maxQuarantine` (3). Retour `false` (quota…) ⇒ l'app **n'écrase pas**
les slots : autosave suspendue, message, export de la donnée abîmée proposé.

### 3.5 Verrou multi-onglets — `SaveLock`
```ts
interface SaveLock { isOwner(): boolean; onChange(cb: (owner: boolean) => void): void; release(): void }
```
- **Web Locks** (si `navigator.locks`) : `request("dernier-refuge-save", { ifAvailable: true })` ; si refusé, une seconde
  requête **en attente** ; obtenue quand l'autre onglet se ferme ⇒ `onChange(true)`. Lock tenu par une promesse
  jamais résolue avant `release()`.
- **Bail de secours** (`createLeaseLock({ storage, tabId, now, ttlMs, })`) : clé `lock = { owner, expiresAt }`.
  `tryAcquire()` : absent/expiré/à moi ⇒ écrire, relire, owner === moi. `heartbeat()` toutes les `lockHeartbeatMs`
  (2 s) prolonge de `lockTtlMs` (6 s) si toujours à moi, sinon perte ⇒ `onChange(false)`. `isOwner()` vérifie aussi
  `expiresAt > now()`. `release()` à `pagehide` (supprime seulement si à moi). L'app écoute l'événement `storage` sur
  la clé `lock` pour retenter immédiatement. Course résiduelle (écritures simultanées) acceptée : la relecture + le
  contrôle à chaque `writeSave` la rendent sans effet durable. `tabId` et `now` injectés ⇒ testable sans timer.
- Stockage indisponible ⇒ pas de verrou nécessaire (rien n'est écrit).

### 3.6 Migrations
`migrations[n]` transforme un état brut vN en vN+1 (fonction pure sur `unknown`, aucune validation interne : la
validation se fait **après** le pipeline, sur la forme courante). `CURRENT_VERSION = 1` ⇒ registre vide.
Règle : toute modification de forme de `GameState` ⇒ `CURRENT_VERSION++`, `migrations[N-1]`, nouveau schéma,
nouvelle fixture `vN`, fixtures précédentes conservées et testées. `SALT` et `hash64` ne changent jamais (sinon toutes
les saves sont invalides) ; si un jour il le faut, le hash devient fonction de la version lue.

---

## 4. Rendu / UI (lecture seule de l'état)

Rien dans le canvas. Tout est DOM.

- **`src/app/save-controller.ts`** (nouveau) : démarrage asynchrone (`void boot()` dans `main.ts`) :
  1. `storage = createLocalStorageAdapter(window)` ; `lock` (Web Locks sinon bail ; aucun si `storage === null`).
  2. `loadGame(storage)` ⇒ état initial + notices (table ci-dessous). Si propriétaire : quarantaine des slots abîmés,
     puis `commitFresh` pour `fresh`/`corrupt`.
  3. `startGame({ initialState, seed, ... })`.
  4. Autosave : `setInterval(autosaveIntervalMs)` + `visibilitychange` (hidden) + `pagehide` (save puis `lock.release()`).
     JS étant mono-thread et les ticks exécutés dans `onFrame`, tout gestionnaire voit un état **entre deux ticks**.
     Sauté si `busy` (import/nouvelle partie en cours), non-propriétaire, mode `future`, quarantaine échouée, ou même
     référence que la dernière sauvegarde.
  5. `lock.onChange(true)` après démarrage non-propriétaire ⇒ `loadGame` ⇒ `game.replaceState(...)` + notice
     « Partie reprise ». `onChange(false)` ⇒ notice non-propriétaire, autosave coupée.
- **`src/app/game.ts`** : `GameDeps` reçoit `initialState: GameState` (au lieu de créer l'état) ; `Game` gagne
  `replaceState(state)` (réinitialise `prev = curr = state`, `acc = 0`, `sent` depuis `state.player.input`, et un
  `renderer.reset?()` pour les effets), `setPaused(b)`. Le menu ouvert ⇒ jeu en pause (pas de tick ; l'autosave reste
  possible, l'état ne change pas).
- **`src/ui/menu.ts`** (nouveau) : bouton discret « Menu » en haut à droite (`#menu`), panneau : **Exporter**
  (Blob + `<a download="dernier-refuge-tick<N>.json">`, disponible même sans stockage/non-propriétaire), **Importer**
  (`<input type=file accept=".json,application/json">`, `file.size > maxImportBytes` refusé **avant lecture**, puis
  `file.text()` → `decodeSave(text, { maxBytes })` → confirmation « Remplacer la partie en cours ? » → `replaceState` +
  `commitFresh`), **Nouvelle partie** (confirmation DOM « La partie actuelle sera perdue. Pensez à l'exporter. »),
  **Exporter la sauvegarde endommagée** (visible seulement si une quarantaine existe). L'UI émet des callbacks vers
  l'app ; elle ne touche ni au stockage ni à l'état.
- **`src/ui/notices.ts`** (nouveau) : bandeau persistant (un seul message d'état à la fois, priorité ci-dessous) + toasts
  courts. Textes :

| Situation | Message | Type |
|---|---|---|
| `corrupt`, quarantaine OK | « Sauvegarde endommagée, nouvelle partie lancée. L'ancienne a été mise de côté. » | persistant, fermable |
| `corrupt`, quarantaine KO | « Sauvegarde endommagée, nouvelle partie lancée. Sauvegarde automatique suspendue : exportez l'ancienne depuis le menu. » | persistant |
| `future` | « Sauvegarde d'une version plus récente du jeu. Mettez le jeu à jour. Partie temporaire, non sauvegardée. » | persistant |
| `unavailable` / erreur `quota` | « Sauvegarde indisponible » (+ « stockage plein » si quota) | persistant tant que l'erreur dure |
| non-propriétaire | « Le jeu est ouvert dans un autre onglet : cette partie n'est pas sauvegardée. » | persistant |
| reprise du verrou | « Partie reprise depuis la sauvegarde. » | toast |
| import : `too_large` / `empty`,`not_json` / `future_version` / autre | « Fichier trop volumineux (max 256 Ko) » / « Fichier vide ou illisible » / « Sauvegarde d'une version plus récente du jeu » / « Fichier de sauvegarde invalide ou modifié » | toast |
| import OK / nouvelle partie | « Sauvegarde importée » / « Nouvelle partie » | toast |

  Priorité du bandeau : future > quarantaine KO > non-propriétaire > indisponible > corrupt (fermable). En dev, les
  `details` des refus vont en `console.warn`.
- **`index.html`** : `<div id="menu"></div><div id="notices" role="status" aria-live="polite"></div>` dans `#app`.
  Styles dans `src/styles/main.css`. Le bouton Menu ne doit pas capturer ZQSD ni gêner le joystick (zone exclue).

---

## 5. Anti-triche — invariants

### Forme (`src/save/schema.ts`, avant tout usage)
- Objets stricts, exactement les clés de `SavedStateV1` (pas de `map`) ; enums exacts (`SurvivorStatus`, `TentStatus`,
  `NodeStatus`, `NodeKind`, `DropResource`, `ResourceId` — les 5 clés de `resources`, ni plus ni moins).
- Tous les nombres : entiers sûrs ; `rng ∈ [0, 2^32-1]` ; positions `∈ [0, 16·1000)` / `[0, 12·1000)` ;
  `player.input.dx/dy ∈ {-1,0,1}` ; `tentId`, `occupantId`, `builtTentId` : entier ou `null`.
- Tailles (anti-DoS, avant les invariants) : `survivors ≤ 64`, `survivors[i].path ≤ 192`, `queue ≤ 16`, `tents ≤ 16`,
  `buildSlots ≤ 16`, `nodes ≤ 64`, `drops ≤ 512` ; texte `≤ 256 Ko` ; profondeur canonique `≤ 16`.

### Règles (`src/core/invariants.ts`, `core-dev` — ajouts, vrais aussi à l'exécution)
- `rng` entier `[0, 2^32-1]` ; `commandsThisTick ≤ LIMITS.maxCommandsPerTick` ; `player.input` axes valides.
- `spawnTimer ≤ max(SURVIVOR.firstSpawnTicks, SURVIVOR.spawnIntervalMax)` ;
  `restTicksLeft ≤ SURVIVOR.restTicks` ; `payCooldown ≤ max(0, BUILD.payIntervalTicks - 1)`.
- `survivors` et `tents` triés par id strictement croissant.
- `buildSlots` = emplacements de la carte : même nombre, `tile` et `cost === BUILD.slotCosts[i]` dans l'ordre
  (aujourd'hui `cost` n'est pas vérifié : `cost: 1` passerait).
- Tentes : tuiles = `{T de la carte} ∪ {tuiles des slots construits}`, sans doublon.
- Chemins des survivants : chaque `TilePos` dans la carte et praticable.
- **Plausibilité** (nouveau, constantes `PLAUSIBILITY` dans `src/data`) :
  `wood + Σdrops(wood) + Σpaid ≤ START.wood + tick × PLAUSIBILITY.woodPerTick` et
  `food + Σdrops(food) ≤ START.food + tick × PLAUSIBILITY.foodPerTick`.
  Couvre le cas « tas au sol de 999 999 » (le plafond 9999 ne s'applique qu'au stock). Ne bloque pas une triche
  plausible : c'est une limite assumée.
- Existants inchangés : ressources `[0, cap]`, ids uniques `< nextId`, file, tentes ↔ survivants, slots, nœuds vs carte,
  drops, joueur hors obstacle, carte = référence.

### Limite honnête
Le sel est dans le bundle client : le checksum n'arrête que l'édition naïve (éditeur de texte, devtools sur la clé).
Quiconque lit le code peut re-signer. Les invariants + la plausibilité bornent ce qu'une save re-signée peut contenir.

---

## 6. Tests

### `tests/save/` (save-guardian)
- `canonical.test.ts` : ordre des clés indifférent ⇒ même chaîne ; NaN, Infinity, -Infinity, 1.5e300 non sûr, `undefined`,
  profondeur 17 ⇒ lève ; tableau ordre conservé.
- `hash.test.ts` : valeurs figées (vecteurs connus, gelés), 16 hex, 1 caractère changé ⇒ hash différent.
- `codec.test.ts` : **aller-retour** `decodeSave(encodeSave(s))` `toEqual` s (initial, mi-partie après simulation
  scriptée avec survivants en marche, drops, nœud épuisé, slot partiel, `commandsThisTick > 0`, `input ≠ 0`) ;
  checksum faux / 1 octet changé dans `state` / `savedAt` / `seed` ⇒ `bad_checksum` ; **valeurs trafiquées re-signées**
  (helper `resign(env)` qui recalcule le checksum, pour tester la validation et pas seulement le hash) : bois 999 999,
  bois -1, `"NaN"`/`null` à la place d'un nombre, 1.5, ids en double, champ manquant, champ en trop, `map` présente,
  `__proto__`, drop de 999 999 au tick 10 (plausibilité), slot `cost: 1`, `rng: -1`, chaîne non ASCII ⇒ refus avec la
  bonne erreur ; `version: 2` ⇒ `future_version` ; `version: 0` ⇒ `unsupported_version` ; vide, `"null"`, `"[]"`,
  texte aléatoire, 300 Ko ⇒ refus, sans exception.
- `migrations.test.ts` : registre complet pour `1..CURRENT_VERSION-1` ; avec un registre factice (v1→v2 ajoute un
  champ, cible 2) le pipeline applique les étapes dans l'ordre ; étape manquante ou qui lève ⇒ `migration_failed`.
- `fixture-v1.test.ts` : `tests/save/fixtures/v1-midgame.json` (et `v1-initial.json`) se chargent, valeurs clés
  (`tick`, ressources, statuts) égales aux valeurs notées ; la fixture n'est **jamais** régénérée automatiquement
  (génération unique via `UPDATE_SAVE_FIXTURES=1 npm test -- fixture`, puis commit).
- `slots.test.ts` (MemoryStorage) : écriture alterne A/B et bascule `current` ; relecture différente
  (`corruptOnWrite`) ⇒ `readback_mismatch`, pointeur inchangé, ancien slot toujours chargé ; A abîmé ⇒ B chargé et A
  signalé `damaged` ; pointeur absent ⇒ plus grand `savedAt` ; les deux abîmés ⇒ `corrupt` ; quarantaine : contenu brut
  conservé, rotation à 3, échec d'écriture ⇒ `false` et slots intacts ; slot `future` ⇒ `future`, rien écrit ;
  `commitFresh` ⇒ A et B identiques ; quota (`failSet: "quota"`, `quotaChars` petit) ⇒ `quota`, aucune exception ;
  `getItem` qui lève ⇒ `unavailable` ; `createLocalStorageAdapter({})` et accès qui lève `SecurityError` ⇒ `null`.
- `lock.test.ts` (horloge et tabIds injectés, sans timer) : 1er onglet propriétaire, 2e non ; heartbeat prolonge ;
  propriétaire silencieux > TTL ⇒ l'autre acquiert ; `release` ⇒ acquisition immédiate ; perte détectée au heartbeat ⇒
  `onChange(false)` ; `writeSave` d'un non-propriétaire ⇒ `not_owner`. Web Locks avec un faux `LockManager`.

### `tests/save/` (test-writer)
- `reload-determinism.test.ts` : bot scripté 3 000 ticks, seed fixe ; run B identique mais encode/décode (via
  MemoryStorage + `loadGame`) à 5 moments, dont juste après une commande avant le tick ⇒ état final `toEqual` run A,
  et `rng` identique à chaque tick suivant.
- `fuzz-load.test.ts` (RNG seedé du core, déterministe, ≥ 5 000 cas, < 10 s) : à partir de saves valides de
  plusieurs moments de partie, mutations (a) d'octets du texte (sans re-signer) et (b) **structurelles re-signées** :
  changer un nombre (±1, 0, -1, 2^31, 2^53, 1.5), changer un type, supprimer/ajouter une clé, dupliquer/vider un tableau,
  échanger deux éléments, changer un enum. Propriété : `decodeSave` ne lève jamais ; si `ok`, `checkInvariants` vide et
  20 `tick()` sans exception ni violation ; sinon `error` dans l'union.
- `import.test.ts` : chaîne vide, 1 octet, JSON valide non-save, 10 Mo (refus `too_large` sans `JSON.parse`), save
  d'un autre seed valide ⇒ acceptée, export ⇒ import ⇒ `toEqual`.

### `tests/core/` (core-dev)
- `invariants-detect.test.ts` : un cas positif et un négatif par invariant ajouté (§5) ; `referenceMap()` gelée et
  `toEqual` à `createInitialState(x).map`.
- Les simulations et fuzz existants (`simulation`, `fuzz-simulation`, `harvest-simulation`) doivent rester verts avec
  les nouveaux invariants (preuve qu'ils sont vrais à l'exécution, notamment la plausibilité).
- `tests/core/balance.test.ts` : `PLAUSIBILITY.*PerTick` ≥ borne théorique calculée depuis `NODES`, `SURVIVOR`,
  nombre de tentes possible.

---

## 7. Constantes

**`src/save/config.ts`** (techniques, pas de gameplay — donc hors `src/data`) :
```ts
export const CURRENT_VERSION = 1;
export const SAVE_CONFIG = {
  keyPrefix: "dernier-refuge.",
  salt: "<chaîne aléatoire figée>",       // gelé pour toujours
  maxSaveChars: 256 * 1024,               // stockage et import (une save mi-partie ≈ 5–15 Ko)
  maxImportBytes: 256 * 1024,
  maxDepth: 16,
  maxQuarantine: 3,
  limits: { survivors: 64, path: 192, queue: 16, tents: 16, buildSlots: 16, nodes: 64, drops: 512 },
  autosaveIntervalMs: 10_000,
  lockTtlMs: 6_000,
  lockHeartbeatMs: 2_000,
} as const;
```
**`src/data/balance.ts`** (gameplay) : `export const PLAUSIBILITY = { woodPerTick: 1, foodPerTick: 1 } as const;`
(borne théorique actuelle ≈ 0,4 bois/tick et 0,14 nourriture/tick ; marge large pour ne jamais rejeter une vraie partie).
`OFFLINE` reste inutilisé par la save (hors périmètre).

---

## 8. Découpage des tâches

| # | Agent | Tâche | Fichiers |
|---|---|---|---|
| 1 | balance-designer | `PLAUSIBILITY` | `src/data/balance.ts` |
| 2 | core-dev | `referenceMap()` (gelée, utilisée par `createInitialState`, exportée par `index.ts`) ; invariants §5 ; tests associés + `balance.test.ts` plausibilité | `src/core/map.ts`, `state.ts`, `invariants.ts`, `index.ts`, `tests/core/` |
| 3 | save-guardian | `config`, `canonical`, `hash`, `schema`, `codec`, `migrations`, `storage`, `slots`, `lock`, `index` + tests §6 « save-guardian » + fixtures v1 (générées après la tâche 2) | `src/save/`, `tests/save/` |
| 4 | render-dev | `save-controller.ts`, `game.ts` (`initialState`, `replaceState`, `setPaused`), `main.ts` async, `seed.ts` (`randomSeed()` via `crypto`), `ui/menu.ts`, `ui/notices.ts`, `index.html`, CSS ; renderer `reset()` des effets | `src/app/`, `src/ui/`, `src/render/`, `src/main.ts`, `index.html`, `src/styles/` |
| 5 | test-writer | `reload-determinism`, `fuzz-load`, `import` | `tests/save/` |

Dépendances : 1 → 2 → 3 → (4, 5 en parallèle). Fin de feature : cocher les 3 cases du Jalon 2 dans `docs/ROADMAP.md`.
Vérification manuelle (render-dev) : deux onglets, navigation privée, DevTools « quota » (Application > Storage),
édition à la main de `dernier-refuge.save.A`, fermeture d'onglet en plein mouvement.

---

## 9. Choix à valider par l'utilisateur
1. **`GameState` inchangé** ; `map` non sérialisée (reconstruite) ; `commandsThisTick` et `player.input` sauvegardés tels quels.
2. Slot « le plus récent » = pointeur `current` (ordre de commit), `savedAt` seulement en secours (robuste aux
   changements d'horloge).
3. Un slot abîmé est mis en quarantaine même si l'autre est valide ; rotation des quarantaines bornée à 3.
4. Version future ⇒ partie temporaire **sans autosave** (pas de repli sur le slot plus ancien).
5. Nouvelle partie / import écrivent les deux slots ; l'import demande aussi une confirmation.
6. Onglet secondaire : jouable sur une copie de la save ; à la reprise du verrou, il **recharge** la save (sa
   progression locale est abandonnée).
7. Nouvelle invariant de **plausibilité** (ressources totales ≤ départ + tick × 1) ajoutée au core.
8. Hash synchrone cyrb53 64 bits (pas SHA-256 async, incompatible avec `pagehide`) ; constantes techniques dans
   `src/save/config.ts` et non `src/data`.
9. Nouvelle partie sans `?seed=` ⇒ seed aléatoire (aujourd'hui `DEFAULT_SEED` fixe ⇒ toutes les parties identiques).

---

## 10. Notes d'implémentation / limites

- **Bornes d'équilibrage vérifiées au chargement** : les invariants utilisent des constantes de `src/data` (repos
  `SURVIVOR.restTicks`, intervalles d'arrivée `SURVIVOR.firstSpawnTicks`/`spawnIntervalMax`, durée de nettoyage,
  cooldown de paiement `BUILD.payIntervalTicks`, repousse des nœuds, `PLAUSIBILITY`). **Baisser l'une d'elles rend des
  sauvegardes honnêtes invalides** (compteur au-dessus de la nouvelle borne ⇒ `invariants`). Obligatoire dans ce cas :
  `CURRENT_VERSION++` + migration qui ramène les compteurs concernés à la nouvelle borne + fixture.
- **Anti-triche côté client seulement** : le sel est dans le code, re-signer une save est possible ; gonfler `tick`
  neutralise la plausibilité (la borne croît avec `tick`). Protège contre l'édition naïve, pas contre un tricheur
  déterminé.
- **`PLAUSIBILITY`** couvre aussi pierre, eau et pièces (taux 0/tick tant qu'aucun système ne les produit).
- **Écart avec §3.2** : `createLocalStorageAdapter` ne renvoie jamais `null`. Un stockage inutilisable est détecté via
  `loadGame` ⇒ `unavailable`. Un stockage en lecture seule apparaît comme « stockage plein » (erreur `quota`).
- **`?seed=N`** lance une partie temporaire qui ne lit ni n'écrit la sauvegarde (bandeau explicatif).
- **Import / Nouvelle partie** sont désactivés quand l'onglet n'est pas propriétaire du verrou ou en partie temporaire
  (export toujours disponible).
- **`commitFresh`** écrit et relit A, B et le pointeur `current` ; `ok` seulement si les trois sont cohérents.
- **Logique de décision du contrôleur** (démarrage, onglet secondaire, reprise du verrou, blocages, autosave) : fonction
  pure dans `src/save/boot.ts`, testée dans `tests/save/boot.test.ts` ; `src/app/save-controller.ts` ne fait que
  câbler le DOM, les timers et le stockage autour d'elle.
- **Fixtures v1** : la CI vérifie que le générateur reproduit exactement les fixtures v1 commitées
  (`CHECK_SAVE_FIXTURES=1`).
