import Decimal from "decimal.js";
import type { Data } from "../../model";
import { base, newId, type Base, type FarmOS } from "../domain";
import { ops, transact } from "../operations";
import { withdrawals } from "./cattle";
import { consume } from "./inventory";
import { qty } from "./primitives";
import {
  type Account,
  type Journal,
  type Posting,
  type Sale,
  type Scenario,
  type Unit,
} from "./types";
export function journal(
  f: FarmOS,
  description: string,
  kind: string,
  referenceId: string,
  postings: Posting[],
  at = Date.now(),
  category = "",
  contact = "",
) {
  if (
    !postings.length ||
    postings.some((p) => !Number.isSafeInteger(p.cents)) ||
    postings.reduce((n, p) => n + p.cents, 0) !== 0
  )
    throw Error("Unbalanced financial posting.");
  const j: Journal = {
    ...base(f),
    at,
    description,
    kind,
    referenceId,
    postings,
    category,
    contact,
  };
  ops(f).journals.push(j);
  return j;
}

export function post(
  account: Account,
  cents: number,
  dimensions: Partial<Omit<Posting, "account" | "cents">> = {},
): Posting {
  return {
    enterpriseId: "",
    fieldId: "",
    groupId: "",
    assetId: "",
    animalId: "",
    ...dimensions,
    account,
    cents,
  };
}

export function accountBalance(
  f: FarmOS,
  account: Account,
  enterpriseId = "",
  animalId = "",
) {
  return ops(f)
    .journals.flatMap((j) => j.postings)
    .filter(
      (p) =>
        p.account === account &&
        (!enterpriseId || p.enterpriseId === enterpriseId) &&
        (!animalId || p.animalId === animalId),
    )
    .reduce((n, p) => n + p.cents, 0);
}

export function addExpense(
  d: Data,
  input: {
    enterpriseId: string;
    fieldId: string;
    assetId: string;
    animalId?: string;
    groupId?: string;
    amountCents: number;
    description: string;
    category: string;
    contact: string;
    at: number;
  },
  commandId = newId(),
) {
  return transact(
    d,
    "finance.expense",
    (f, o) => {
      const e = o.enterprises.find((e) => e.id === input.enterpriseId);
      const account =
        e?.kind === "crop"
          ? "cropWip"
          : e?.kind === "cattle"
            ? "cattleWip"
            : "expense";
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
        throw Error("Expense amount must be positive.");
      const dim = {
        enterpriseId: input.enterpriseId,
        fieldId: input.fieldId,
        assetId: input.assetId,
        animalId: input.animalId ?? "",
        groupId: input.groupId ?? "",
      };
      return journal(
        f,
        input.description,
        "expense",
        commandId,
        [
          post(account, input.amountCents, dim),
          post("cash", -input.amountCents),
        ],
        input.at,
        input.category,
        input.contact,
      ).id;
    },
    commandId,
  );
}

export function sell(
  d: Data,
  input: Omit<Sale, keyof Base | "costCents">,
  commandId = newId(),
) {
  return transact(
    d,
    "finance.sale",
    (f, o) => {
      if (input.feesCents > input.grossCents)
        throw Error("Fees cannot exceed gross proceeds.");
      const row: Sale = { ...base(f), ...input, costCents: 0 };
      let enterpriseId = input.enterpriseId;
      const postings: Posting[] = [
        post("cash", input.grossCents - input.feesCents),
        post("revenue", -input.grossCents, { enterpriseId }),
        post("expense", input.feesCents, { enterpriseId }),
      ];
      if (
        [input.itemId, input.animalId, input.groupId].filter(Boolean).length !==
        1
      )
        throw Error("Choose exactly one animal, group, or commodity.");
      if (input.itemId) {
        const item = o.items.find((i) => i.id === input.itemId);
        if (!item || item.unit !== input.unit)
          throw Error("Sale quantity must use the inventory item unit.");
        row.costCents = consume(
          f,
          input.itemId,
          input.quantity,
          "sale",
          row.id,
          input.at,
        ).costCents;
        postings.push(
          post("expense", row.costCents, { enterpriseId }),
          post("inventory", -row.costCents),
        );
      } else if (input.animalId) {
        if (input.quantity !== 1 || input.unit !== "count")
          throw Error("Individual animal sale must use one count.");
        const a = o.animals.find(
          (a) => a.id === input.animalId && a.status === "active",
        );
        const group = o.groups.find((g) => g.id === a?.groupId);
        if (!a || !group || group.enterpriseId !== enterpriseId)
          throw Error("Animal sale must use its cattle enterprise.");
        if (withdrawals(f, a.id, input.at).length && !input.withdrawalOverride)
          throw Error(
            "Withdrawal restrictions recorded. Verification and explicit override are required; this app cannot declare slaughter safety.",
          );
        const own = accountBalance(f, "cattleWip", enterpriseId, a.id);
        const pool = o.journals
          .flatMap((j) => j.postings)
          .filter(
            (p) =>
              p.account === "cattleWip" &&
              p.groupId === group.id &&
              !p.animalId,
          )
          .reduce((n, p) => n + p.cents, 0);
        const count = o.animals.filter(
          (x) => x.groupId === group.id && x.status === "active",
        ).length;
        const share = new Decimal(pool)
          .div(count)
          .toDecimalPlaces(0)
          .toNumber();
        row.costCents = own + share;
        a.status = "sold";
        postings.push(
          post("expense", row.costCents, { enterpriseId, animalId: a.id }),
          post("cattleWip", -own, {
            enterpriseId,
            animalId: a.id,
            groupId: group.id,
          }),
          post("cattleWip", -share, { enterpriseId, groupId: group.id }),
        );
      } else if (input.groupId) {
        const group = o.groups.find(
          (g) =>
            g.id === input.groupId &&
            g.mode === "headcount" &&
            g.enterpriseId === enterpriseId,
        );
        if (
          !group ||
          input.unit !== "count" ||
          !Number.isInteger(input.quantity) ||
          input.quantity < 1 ||
          input.quantity > group.headCount
        )
          throw Error(
            "Group sale requires an available headcount-managed group and whole head count.",
          );
        if (
          o.health.some(
            (h) => h.groupId === group.id && h.withdrawalUntil >= input.at,
          ) &&
          !input.withdrawalOverride
        )
          throw Error(
            "Group withdrawal restriction requires independent verification and explicit override.",
          );
        const pool = o.journals
          .flatMap((j) => j.postings)
          .filter(
            (p) =>
              p.account === "cattleWip" &&
              p.groupId === group.id &&
              !p.animalId,
          )
          .reduce((n, p) => n + p.cents, 0);
        row.costCents = new Decimal(pool)
          .mul(input.quantity)
          .div(group.headCount)
          .toDecimalPlaces(0)
          .toNumber();
        group.headCount -= input.quantity;
        postings.push(
          post("expense", row.costCents, { enterpriseId, groupId: group.id }),
          post("cattleWip", -row.costCents, {
            enterpriseId,
            groupId: group.id,
          }),
        );
      } else throw Error("Choose animal, headcount group, or commodity.");
      o.sales.push(row);
      journal(
        f,
        "Sale to " + input.buyer,
        "sale",
        row.id,
        postings,
        input.at,
        "sales",
        input.buyer,
      );
      return row.id;
    },
    commandId,
  );
}

export function allocateCost(
  d: Data,
  journalId: string,
  targets: {
    enterpriseId: string;
    fieldId: string;
    groupId: string;
    animalId: string;
    cents: number;
  }[],
  basis: string,
  commandId = newId(),
) {
  return transact(
    d,
    "finance.allocate",
    (f, o) => {
      const source = o.journals.find(
        (j) => j.id === journalId && j.kind === "expense",
      );
      if (
        !source ||
        o.journals.some(
          (j) => j.kind === "allocation" && j.referenceId === journalId,
        )
      )
        throw Error("Choose an unallocated original expense.");
      const original = source.postings.find((p) => p.cents > 0);
      if (
        !original ||
        targets.reduce((n, t) => n + t.cents, 0) !== original.cents ||
        targets.some((t) => t.cents < 0 || !Number.isSafeInteger(t.cents))
      )
        throw Error("Allocations must exactly reconcile to source expense.");
      const lines = targets.map((t) => {
        const e = o.enterprises.find((e) => e.id === t.enterpriseId);
        return post(
          e?.kind === "crop"
            ? "cropWip"
            : e?.kind === "cattle"
              ? "cattleWip"
              : "expense",
          t.cents,
          t,
        );
      });
      return journal(f, "Allocation · " + basis, "allocation", journalId, [
        post(original.account, -original.cents, original),
        ...lines,
      ]).id;
    },
    commandId,
  );
}

export function enterpriseReport(f: FarmOS, enterpriseId: string) {
  const o = ops(f);
  const entries = o.journals
    .flatMap((j) => j.postings)
    .filter((p) => p.enterpriseId === enterpriseId);
  const production = o.journals
    .filter((j) =>
      [
        "expense",
        "application",
        "acquisition",
        "feed",
        "treatment",
        "reversal",
        "group-transfer",
        "animal-transfer",
      ].includes(j.kind),
    )
    .flatMap((j) => j.postings)
    .filter(
      (p) =>
        p.enterpriseId === enterpriseId &&
        ["cropWip", "cattleWip", "expense"].includes(p.account),
    )
    .reduce((n, p) => n + p.cents, 0);
  const allocations = o.journals
    .filter((j) => j.kind === "allocation")
    .flatMap((j) => j.postings)
    .filter((p) => p.enterpriseId === enterpriseId)
    .reduce((n, p) => n + p.cents, 0);
  const revenue = -entries
    .filter((p) => p.account === "revenue")
    .reduce((n, p) => n + p.cents, 0);
  const expense = entries
    .filter((p) => p.account === "expense")
    .reduce((n, p) => n + p.cents, 0);
  return {
    productionCents: production + allocations,
    revenueCents: revenue,
    recognizedExpenseCents: expense,
    operatingMarginCents: revenue - expense,
    workInProcessCents: entries
      .filter((p) => ["cropWip", "cattleWip"].includes(p.account))
      .reduce((n, p) => n + p.cents, 0),
  };
}

export function scenarioResult(f: FarmOS, s: Scenario) {
  const r = enterpriseReport(f, s.enterpriseId);
  const quantity = new Decimal(s.quantity).mul(
    new Decimal(1).plus(new Decimal(s.yieldChangePercent).div(100)),
  );
  const cost = new Decimal(r.productionCents).mul(
    new Decimal(1).plus(new Decimal(s.costChangePercent).div(100)),
  );
  const revenue = quantity.mul(s.priceCents);
  return {
    quantity: qty(quantity),
    costCents: cost.toDecimalPlaces(0).toNumber(),
    revenueCents: revenue.toDecimalPlaces(0).toNumber(),
    marginCents: revenue.minus(cost).toDecimalPlaces(0).toNumber(),
    breakevenPriceCents: quantity.gt(0)
      ? cost.div(quantity).toDecimalPlaces(0).toNumber()
      : null,
  };
}

export function productionMetrics(f: FarmOS, enterpriseId: string) {
  const o = ops(f),
    r = enterpriseReport(f, enterpriseId);
  const seasons = o.seasons.filter((s) => s.enterpriseId === enterpriseId),
    acres = seasons.reduce((n, s) => n + s.acres, 0);
  const quantities: Partial<Record<Unit, number>> = {};
  for (const h of o.harvests.filter((h) =>
    seasons.some((s) => s.id === h.seasonId),
  ))
    quantities[h.unit] = qty(
      new Decimal(quantities[h.unit] ?? 0).plus(h.quantity),
    );
  const groups = o.groups.filter((g) => g.enterpriseId === enterpriseId);
  const animals = o.animals.filter((a) =>
    groups.some((g) => g.id === a.groupId),
  );
  let gain = new Decimal(0);
  for (const a of animals) {
    const weights = o.weights
      .filter((w) => w.animalId === a.id)
      .sort((a, b) => a.at - b.at);
    if (weights.length > 1)
      gain = gain.plus(
        Decimal.max(
          0,
          new Decimal(weights.at(-1)!.weightLb).minus(weights[0].weightLb),
        ),
      );
  }
  const feedCost = o.feeds
    .filter((v) => groups.some((g) => g.id === v.groupId))
    .reduce((n, v) => n + v.costCents, 0);
  return {
    acres,
    costPerAcreCents: acres ? Math.round(r.productionCents / acres) : null,
    quantities,
    costPerUnit: Object.entries(quantities).map(([unit, quantity]) => ({
      unit,
      quantity,
      costCents: quantity ? Math.round(r.productionCents / quantity) : null,
    })),
    recordedGainLb: qty(gain),
    feedCostPerGainCents: gain.gt(0)
      ? new Decimal(feedCost).div(gain).toDecimalPlaces(0).toNumber()
      : null,
    costPerGainCents: gain.gt(0)
      ? new Decimal(r.productionCents).div(gain).toDecimalPlaces(0).toNumber()
      : null,
  };
}

export function reverseExpense(
  d: Data,
  journalId: string,
  reason: string,
  commandId = newId(),
) {
  return transact(
    d,
    "finance.reversal",
    (f, o) => {
      const old = o.journals.find(
        (j) => j.id === journalId && j.kind === "expense",
      );
      if (
        !old ||
        o.journals.some(
          (j) =>
            j.reversalOf === journalId ||
            (j.kind === "allocation" && j.referenceId === journalId),
        )
      )
        throw Error("Choose an unreversed, unallocated original expense.");
      if (!reason.trim()) throw Error("A correction reason is required.");
      for (const p of old.postings.filter(
        (p) => p.cents > 0 && ["cropWip", "cattleWip"].includes(p.account),
      ))
        if (accountBalance(f, p.account, p.enterpriseId, p.animalId) < p.cents)
          throw Error(
            "Cost has already been transferred or consumed; reconcile downstream records before reversing.",
          );
      const j = journal(
        f,
        "Reversal · " + reason,
        "reversal",
        old.id,
        old.postings.map((p) => ({ ...p, cents: -p.cents })),
      );
      j.reversalOf = old.id;
      return j.id;
    },
    commandId,
  );
}
