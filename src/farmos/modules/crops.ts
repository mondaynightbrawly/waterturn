import { refreshMaintenanceTasks } from "./assets";
import Decimal from "decimal.js";
import type { Data } from "../../model";
import { activity, base, newId, requireFarm, type Base } from "../domain";
import { ops, transact } from "../operations";
import { consume, receive } from "./inventory";
import { accountBalance, journal, post } from "./ledger";
import { qty } from "./primitives";
import { type Harvest, type Work } from "./types";
export function harvest(
  d: Data,
  input: Omit<Harvest, keyof Base | "lotId"> & {
    itemId: string;
    location: string;
  },
  commandId = newId(),
) {
  return transact(
    d,
    "crop.harvest",
    (f, o) => {
      const season = o.seasons.find((s) => s.id === input.seasonId);
      const item = o.items.find((i) => i.id === input.itemId);
      if (!season || !item || item.unit !== input.unit)
        throw Error(
          "Choose a crop season and inventory item with the same unit.",
        );
      if (input.costCents > accountBalance(f, "cropWip", season.enterpriseId))
        throw Error(
          "Harvest value exceeds recorded crop production cost. Record production expenses first.",
        );
      const row: Harvest = { ...base(f), ...input, lotId: "" };
      const lot = receive(
        f,
        input.itemId,
        input.quantity,
        input.costCents,
        input.location,
        "produced",
        row.id,
        input.at,
        input.moisturePercent === undefined
          ? undefined
          : 100 - input.moisturePercent,
      );
      row.lotId = lot.id;
      o.harvests.push(row);
      journal(
        f,
        "Harvest cost to inventory",
        "harvest",
        row.id,
        [
          post("inventory", input.costCents, {
            enterpriseId: season.enterpriseId,
            fieldId: season.fieldId,
          }),
          post("cropWip", -input.costCents, {
            enterpriseId: season.enterpriseId,
            fieldId: season.fieldId,
          }),
        ],
        input.at,
      );
      return row.id;
    },
    commandId,
  );
}

export function recordFieldwork(
  d: Data,
  input: Omit<Work, keyof Base>,
  commandId = newId(),
) {
  return transact(
    d,
    "crop.fieldwork",
    (f, o) => {
      const season = o.seasons.find(
        (s) => s.id === input.seasonId && s.fieldId === input.fieldId,
      );
      if (!season) throw Error("Choose matching field and crop season.");
      const row = { ...base(f), ...input };
      if (input.assetId) {
        const asset = o.assets.find(
          (a) => a.id === input.assetId && a.status === "available",
        );
        if (!asset) throw Error("Equipment is unavailable.");
        asset.hours = qty(new Decimal(asset.hours).plus(input.hours));
        o.meters.push({
          ...base(f),
          assetId: asset.id,
          at: input.at,
          hours: asset.hours,
          miles: asset.miles,
          notes: "Fieldwork " + row.id,
        });
      }
      if (input.assetId) {
        const asset = o.assets.find((a) => a.id === input.assetId)!;
        refreshMaintenanceTasks(f, o, asset);
      }
      if (input.inputItemId && input.inputQuantity > 0) {
        const value = consume(
          f,
          input.inputItemId,
          input.inputQuantity,
          "application",
          row.id,
          input.at,
        );
        journal(
          f,
          "Field input consumption",
          "application",
          row.id,
          [
            post("cropWip", value.costCents, {
              enterpriseId: season.enterpriseId,
              fieldId: season.fieldId,
            }),
            post("inventory", -value.costCents),
          ],
          input.at,
        );
      }
      if (input.costCents > 0)
        journal(
          f,
          "Fieldwork direct expense",
          "expense",
          row.id,
          [
            post("cropWip", input.costCents, {
              enterpriseId: season.enterpriseId,
              fieldId: season.fieldId,
              assetId: input.assetId,
            }),
            post("cash", -input.costCents),
          ],
          input.at,
          "fieldwork",
        );
      o.work.push(row);
      return row.id;
    },
    commandId,
  );
}

export function bulkFieldwork(
  d: Data,
  seasonIds: string[],
  input: Omit<Work, keyof Base | "seasonId" | "fieldId">,
  commandId = newId(),
) {
  if (!seasonIds.length || new Set(seasonIds).size !== seasonIds.length)
    throw Error("Choose distinct crop seasons.");
  const f = requireFarm(d);
  if (f.receipts.includes(commandId)) return structuredClone(d);
  const selected = seasonIds.map((id) =>
    ops(f).seasons.find((s) => s.id === id),
  );
  if (selected.some((s) => !s)) throw Error("Crop season missing.");
  const total = selected.reduce((n, s) => n + s!.acres, 0);
  if (total <= 0)
    throw Error(
      "Selected seasons need planted acreage for proportional allocation.",
    );
  let next = structuredClone(d),
    allocated = 0;
  const allocatedQuantities: Record<string, Decimal> = {};
  for (const [i, s] of selected.entries()) {
    const ratio = new Decimal(s!.acres).div(total);
    const cost =
      i === selected.length - 1
        ? input.costCents - allocated
        : ratio.mul(input.costCents).toDecimalPlaces(0).toNumber();
    allocated += cost;
    const share = (
      key: "acres" | "minutes" | "hours" | "fuel" | "inputQuantity",
    ) => {
      const amount =
        i === selected.length - 1
          ? qty(new Decimal(input[key]).minus(allocatedQuantities[key] ?? 0))
          : qty(ratio.mul(input[key]));
      allocatedQuantities[key] = (
        allocatedQuantities[key] ?? new Decimal(0)
      ).plus(amount);
      return amount;
    };
    next = recordFieldwork(
      next,
      {
        ...input,
        seasonId: s!.id,
        fieldId: s!.fieldId,
        acres: share("acres"),
        minutes: share("minutes"),
        hours: share("hours"),
        fuel: share("fuel"),
        inputQuantity: share("inputQuantity"),
        costCents: cost,
      },
      commandId + "-" + i,
    );
  }
  activity(
    requireFarm(next),
    "crop.bulk-fieldwork",
    "Fieldwork allocated by planted acreage",
    selected[0]!.id,
    "",
    commandId,
  );
  return next;
}
