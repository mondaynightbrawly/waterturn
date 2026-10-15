import type { Data } from "../model";
import { activity, newId, requireFarm, type FarmOS } from "./domain";
import { operationKeys, type Operations } from "./modules/types";
export function emptyOperations(): Operations {
  return Object.fromEntries(
    operationKeys.map((k) => [k, []]),
  ) as unknown as Operations;
}

export function ops(f: FarmOS): Operations {
  const value = f.operations ?? (f.operations = emptyOperations());
  value.rations ??= [];
  return value;
}

export function transact(
  d: Data,
  kind: string,
  fn: (f: FarmOS, o: Operations) => string,
  commandId = newId(),
) {
  const next = structuredClone(d);
  const f = requireFarm(next);
  if (f.receipts.includes(commandId)) return next;
  const entityId = fn(f, ops(f));
  activity(
    f,
    kind,
    kind.replaceAll(".", " ") + " recorded",
    entityId,
    "",
    commandId,
  );
  return next;
}

export * from "./modules/assets";
export * from "./modules/cattle";
export * from "./modules/crops";
export * from "./modules/inventory";
export * from "./modules/ledger";
export * from "./modules/primitives";
export * from "./modules/types";
export * from "./modules/validation";
