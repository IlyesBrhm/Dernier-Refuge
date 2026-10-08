// API publique du cœur logique (à importer depuis src/app, src/render, src/ui, src/save).

export * from "./state";
export { applyCommand, type Command, type CommandError, type CommandResult } from "./commands";
export { tick } from "./tick";
export * from "./selectors";
export { checkInvariants, heldTotal, plausibleMax } from "./invariants";
export { stepBudget, type StepBudget } from "./loop-budget";
export { findPath } from "./path";
export { findHarvestTarget, isNodeInRange, maxRegrowDelay, nodesInRange, regrowDelay } from "./harvest-rules";
export { chebyshev, doorOf, isWalkable, referenceMap, sameTile, tileAt, tileCenter, tileOf } from "./map";
