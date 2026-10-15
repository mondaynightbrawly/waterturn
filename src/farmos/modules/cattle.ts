import Decimal from "decimal.js";
import type { Data } from "../../model";
import {
  activity,
  base,
  newId,
  requireFarm,
  type Base,
  type FarmOS,
} from "../domain";
import { ops, transact } from "../operations";
import { consume } from "./inventory";
import { accountBalance, journal, post } from "./ledger";
import { qty, requirePositive } from "./primitives";
import { type Animal, type Health } from "./types";
export function feed(
  d: Data,
  input: {
    groupId: string;
    itemId: string;
    quantity: number;
    at: number;
    notes: string;
  },
  commandId = newId(),
) {
  return transact(
    d,
    "cattle.feed",
    (f, o) => {
      const group = o.groups.find((g) => g.id === input.groupId && !g.archived);
      const item = o.items.find((i) => i.id === input.itemId);
      if (!group || !item) throw Error("Choose group and inventory item.");
      const headCount =
        group.mode === "individual"
          ? o.animals.filter(
              (a) => a.groupId === group.id && a.status === "active",
            ).length
          : group.headCount;
      if (headCount <= 0)
        throw Error("Group must contain cattle before feeding.");
      const id = newId();
      const value = consume(f, item.id, input.quantity, "feed", id, input.at);
      o.feeds.push({
        ...base(f),
        id,
        ...input,
        unit: item.unit,
        costCents: value.costCents,
        headCount,
        dryMatterQuantity: value.dryMatterQuantity,
      });
      journal(
        f,
        "Feed inventory to cattle",
        "feed",
        id,
        [
          post("cattleWip", value.costCents, {
            enterpriseId: group.enterpriseId,
            groupId: group.id,
          }),
          post("inventory", -value.costCents),
        ],
        input.at,
      );
      return id;
    },
    commandId,
  );
}

export function acquireAnimal(
  d: Data,
  input: Omit<Animal, keyof Base>,
  commandId = newId(),
) {
  return transact(
    d,
    "cattle.acquisition",
    (f, o) => {
      const group = o.groups.find(
        (g) => g.id === input.groupId && g.mode === "individual",
      );
      if (!group) throw Error("Choose an individually managed cattle group.");
      if (o.animals.some((a) => a.tag === input.tag && a.status === "active"))
        throw Error("An active animal already uses this tag.");
      const row = { ...base(f), ...input };
      o.animals.push(row);
      journal(
        f,
        "Animal acquisition",
        "acquisition",
        row.id,
        [
          post("cattleWip", input.acquisitionCents, {
            enterpriseId: group.enterpriseId,
            groupId: group.id,
            animalId: row.id,
          }),
          post("cash", -input.acquisitionCents),
        ],
        input.acquiredAt,
      );
      return row.id;
    },
    commandId,
  );
}

export function moveAnimal(
  d: Data,
  animalId: string,
  toGroupId: string,
  notes: string,
  commandId = newId(),
) {
  return transact(
    d,
    "cattle.move",
    (f, o) => {
      const a = o.animals.find(
        (a) => a.id === animalId && a.status === "active",
      );
      const to = o.groups.find(
        (g) => g.id === toGroupId && g.mode === "individual",
      );
      const from = o.groups.find((g) => g.id === a?.groupId);
      if (!a || !to || !from || from.id === to.id)
        throw Error(
          "Move requires an active animal and a different destination group.",
        );
      const row = {
        ...base(f),
        animalId,
        fromGroupId: a.groupId,
        toGroupId,
        at: Date.now(),
        notes,
      };
      const pool = o.journals
        .flatMap((j) => j.postings)
        .filter(
          (p) =>
            p.account === "cattleWip" && p.groupId === from.id && !p.animalId,
        )
        .reduce((n, p) => n + p.cents, 0);
      const count = o.animals.filter(
        (x) => x.groupId === from.id && x.status === "active",
      ).length;
      const share = new Decimal(pool).div(count).toDecimalPlaces(0).toNumber();
      if (share)
        journal(f, "Group cost pool follows animal", "group-transfer", row.id, [
          post("cattleWip", -share, {
            enterpriseId: from.enterpriseId,
            groupId: from.id,
          }),
          post("cattleWip", share, {
            enterpriseId: to.enterpriseId,
            groupId: to.id,
          }),
        ]);
      if (from.enterpriseId !== to.enterpriseId) {
        const own = accountBalance(f, "cattleWip", from.enterpriseId, a.id);
        if (own)
          journal(
            f,
            "Animal carrying cost follows enterprise",
            "animal-transfer",
            row.id,
            [
              post("cattleWip", -own, {
                enterpriseId: from.enterpriseId,
                groupId: from.id,
                animalId: a.id,
              }),
              post("cattleWip", own, {
                enterpriseId: to.enterpriseId,
                groupId: to.id,
                animalId: a.id,
              }),
            ],
          );
      }
      o.cattleMoves.push(row);
      a.groupId = toGroupId;
      a.updatedAt = Date.now();
      return row.id;
    },
    commandId,
  );
}

export function withdrawals(f: FarmOS, animalId: string, at = Date.now()) {
  const o = ops(f),
    animal = o.animals.find((a) => a.id === animalId);
  return o.health.filter(
    (h) =>
      (h.animalId === animalId || h.groupId === animal?.groupId) &&
      h.withdrawalUntil >= at,
  );
}

export function adg(f: FarmOS, animalId: string) {
  const rows = ops(f)
    .weights.filter((w) => w.animalId === animalId)
    .sort((a, b) => a.at - b.at);
  if (rows.length < 2 || rows.at(-1)!.at <= rows[0].at) return null;
  return new Decimal(rows.at(-1)!.weightLb)
    .minus(rows[0].weightLb)
    .div((rows.at(-1)!.at - rows[0].at) / 86400000)
    .toDecimalPlaces(3)
    .toNumber();
}

export function treatment(
  d: Data,
  input: Omit<Health, keyof Base>,
  commandId = newId(),
) {
  return transact(
    d,
    "cattle.health",
    (f, o) => {
      const a = o.animals.find((a) => a.id === input.animalId);
      const g = o.groups.find((g) => g.id === (input.groupId || a?.groupId));
      if (!g || !!input.animalId === !!input.groupId)
        throw Error("Choose one animal or group.");
      const row = { ...base(f), ...input };
      o.health.push(row);
      if (input.costCents)
        journal(
          f,
          "Cattle treatment",
          "treatment",
          row.id,
          [
            post("cattleWip", input.costCents, {
              enterpriseId: g.enterpriseId,
              animalId: a?.id ?? "",
              groupId: g.id,
            }),
            post("cash", -input.costCents),
          ],
          input.at,
        );
      return row.id;
    },
    commandId,
  );
}

export function feedRation(
  d: Data,
  rationId: string,
  groupId: string,
  multiplier: number,
  at: number,
  notes: string,
  commandId = newId(),
) {
  requirePositive(multiplier, "Ration batches");
  const f = requireFarm(d);
  if (f.receipts.includes(commandId)) return structuredClone(d);
  const ration = ops(f).rations.find((r) => r.id === rationId);
  if (!ration) throw Error("Ration missing.");
  let next = structuredClone(d);
  for (const [i, ingredient] of ration.ingredients.entries())
    next = feed(
      next,
      {
        groupId,
        itemId: ingredient.itemId,
        quantity: qty(new Decimal(ingredient.quantity).mul(multiplier)),
        at,
        notes: ration.name + " · " + notes,
      },
      commandId + "-" + i,
    );
  activity(
    requireFarm(next),
    "cattle.ration-fed",
    ration.name + " · " + multiplier + " batches",
    ration.id,
    "",
    commandId,
  );
  return next;
}
