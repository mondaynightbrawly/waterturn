import Decimal from "decimal.js";
import type { Data } from "../../model";
import { base, newId, type FarmOS } from "../domain";
import { ops, transact } from "../operations";
import { journal, post } from "./ledger";
import { qty, requirePositive } from "./primitives";
import { type Lot, type Movement } from "./types";
export function receive(
  f: FarmOS,
  itemId: string,
  quantity: number,
  valueCents: number,
  location: string,
  origin: Lot["origin"],
  sourceId: string,
  at = Date.now(),
  dryMatterPercent?: number,
) {
  const o = ops(f);
  if (!o.items.some((i) => i.id === itemId && !i.archived))
    throw Error("Inventory item unavailable.");
  requirePositive(quantity);
  if (!Number.isSafeInteger(valueCents) || valueCents < 0)
    throw Error("Invalid inventory value.");
  const lot: Lot = {
    ...base(f),
    itemId,
    location,
    origin,
    quantity,
    valueCents,
    sourceId,
    receivedAt: at,
    dryMatterPercent,
  };
  o.lots.push(lot);
  o.movements.push({
    ...base(f),
    itemId,
    lotId: lot.id,
    quantity,
    valueCents,
    kind: origin === "produced" ? "harvest" : "purchase",
    at,
    referenceId: sourceId,
    notes: "",
  });
  return lot;
}

export function consume(
  f: FarmOS,
  itemId: string,
  quantity: number,
  kind: Movement["kind"],
  referenceId: string,
  at = Date.now(),
) {
  requirePositive(quantity);
  const o = ops(f);
  const lots = o.lots
    .filter((l) => l.itemId === itemId && l.quantity > 0)
    .sort((a, b) => a.receivedAt - b.receivedAt || a.id.localeCompare(b.id));
  const available = lots.reduce((n, l) => n.plus(l.quantity), new Decimal(0));
  if (available.lt(quantity))
    throw Error("Insufficient inventory. No records were changed.");
  let left = new Decimal(quantity),
    cost = 0,
    dm = new Decimal(0),
    known = true;
  for (const l of lots) {
    if (left.isZero()) break;
    const take = Decimal.min(left, l.quantity);
    const value = take.eq(l.quantity)
      ? l.valueCents
      : take
          .div(l.quantity)
          .mul(l.valueCents)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toNumber();
    if (l.dryMatterPercent === undefined) known = false;
    else dm = dm.plus(take.mul(l.dryMatterPercent).div(100));
    l.quantity = qty(new Decimal(l.quantity).minus(take));
    l.valueCents -= value;
    l.updatedAt = Date.now();
    o.movements.push({
      ...base(f),
      itemId,
      lotId: l.id,
      quantity: -take.toNumber(),
      valueCents: -value,
      kind,
      at,
      referenceId,
      notes: "",
    });
    cost += value;
    left = left.minus(take);
  }
  return { costCents: cost, dryMatterQuantity: known ? qty(dm) : undefined };
}

export function purchase(
  d: Data,
  input: {
    itemId: string;
    quantity: number;
    costCents: number;
    location: string;
    at: number;
    expiry?: number;
    dryMatterPercent?: number;
    vendor?: string;
  },
  commandId = newId(),
) {
  return transact(
    d,
    "inventory.purchase",
    (f) => {
      const lot = receive(
        f,
        input.itemId,
        input.quantity,
        input.costCents,
        input.location,
        "purchased",
        commandId,
        input.at,
        input.dryMatterPercent,
      );
      lot.expiresAt = input.expiry;
      journal(
        f,
        "Inventory purchase",
        "purchase",
        lot.id,
        [post("inventory", input.costCents), post("cash", -input.costCents)],
        input.at,
        "inventory",
        input.vendor,
      );
      return lot.id;
    },
    commandId,
  );
}

export function transferLot(
  d: Data,
  lotId: string,
  quantity: number,
  location: string,
  notes: string,
  commandId = newId(),
) {
  return transact(
    d,
    "inventory.transfer",
    (f, o) => {
      requirePositive(quantity);
      const old = o.lots.find((l) => l.id === lotId);
      if (
        !old ||
        old.quantity < quantity ||
        old.location === location ||
        !location.trim()
      )
        throw Error("Choose available stock and a different destination.");
      const cost =
        quantity === old.quantity
          ? old.valueCents
          : new Decimal(quantity)
              .div(old.quantity)
              .mul(old.valueCents)
              .toDecimalPlaces(0)
              .toNumber();
      old.quantity = qty(new Decimal(old.quantity).minus(quantity));
      old.valueCents -= cost;
      const next = {
        ...old,
        ...base(f),
        location,
        quantity,
        valueCents: cost,
        sourceId: commandId,
      };
      o.lots.push(next);
      for (const [lot, sign, kind] of [
        [old, -1, "transfer-out"],
        [next, 1, "transfer-in"],
      ] as const)
        o.movements.push({
          ...base(f),
          itemId: old.itemId,
          lotId: lot.id,
          quantity: sign * quantity,
          valueCents: sign * cost,
          kind,
          at: Date.now(),
          referenceId: commandId,
          notes,
        });
      return next.id;
    },
    commandId,
  );
}

export function inventoryLoss(
  d: Data,
  itemId: string,
  quantity: number,
  notes: string,
  commandId = newId(),
) {
  return transact(
    d,
    "inventory.loss",
    (f) => {
      const value = consume(f, itemId, quantity, "loss", commandId);
      journal(f, "Inventory loss · " + notes, "loss", commandId, [
        post("expense", value.costCents),
        post("inventory", -value.costCents),
      ]);
      return commandId;
    },
    commandId,
  );
}

export function stockSummary(f: FarmOS, itemId: string) {
  const o = ops(f),
    item = o.items.find((i) => i.id === itemId);
  if (!item) throw Error("Inventory item missing.");
  const lots = o.lots.filter((l) => l.itemId === itemId);
  const quantity = qty(
    lots.reduce((total, l) => total.plus(l.quantity), new Decimal(0)),
  );
  return {
    quantity,
    valueCents: lots.reduce((n, l) => n + l.valueCents, 0),
    low: quantity <= item.lowStock,
  };
}
