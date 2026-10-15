import type { Data } from "../../model";
import { base, newId, type FarmOS } from "../domain";
import { transact } from "../operations";
import { journal, post } from "./ledger";
import { type Asset, type Maintenance, type Operations } from "./types";
export function meter(
  d: Data,
  assetId: string,
  hours: number,
  miles: number,
  notes: string,
  commandId = newId(),
) {
  return transact(
    d,
    "asset.meter",
    (f, o) => {
      const a = o.assets.find((a) => a.id === assetId);
      if (!a || hours < a.hours || miles < a.miles)
        throw Error(
          "Meter values cannot decrease. Record a correction separately.",
        );
      a.hours = hours;
      a.miles = miles;
      a.updatedAt = Date.now();
      const row = { ...base(f), assetId, hours, miles, at: Date.now(), notes };
      o.meters.push(row);
      refreshMaintenanceTasks(f, o, a);
      return row.id;
    },
    commandId,
  );
}

export function maintenanceDue(m: Maintenance, a: Asset, at = Date.now()) {
  return (
    m.status === "open" &&
    ((m.dueAt > 0 && m.dueAt <= at) ||
      (m.dueHours > 0 && a.hours >= m.dueHours) ||
      (m.dueMiles > 0 && a.miles >= m.dueMiles))
  );
}

export function service(
  d: Data,
  id: string,
  minutes: number,
  costCents: number,
  diagnosis: string,
  notes: string,
  commandId = newId(),
) {
  return transact(
    d,
    "asset.service",
    (f, o) => {
      const m = o.maintenance.find((m) => m.id === id && m.status === "open");
      const a = o.assets.find((a) => a.id === m?.assetId);
      if (!m || !a) throw Error("Open maintenance and asset required.");
      m.status = "completed";
      m.completedAt = Date.now();
      m.minutes = minutes;
      m.costCents = costCents;
      m.diagnosis = diagnosis;
      m.notes = notes;
      m.updatedAt = Date.now();

      if (costCents)
        journal(
          f,
          "Equipment service · " + m.title,
          "expense",
          m.id,
          [
            post("expense", costCents, { assetId: a.id }),
            post("cash", -costCents),
          ],
          Date.now(),
          "equipment",
        );
      const t = f.tasks.find((t) => t.id === m.workOrderId);
      if (t && t.status !== "completed") {
        t.status = "completed";
        t.actualMinutes = minutes;
        t.completedAt = Date.now();
        t.notes = notes;
      }
      if (m.intervalDays || m.intervalHours || m.intervalMiles) {
        const next = {
          ...m,
          ...base(f),
          status: "open" as const,
          costCents: 0,
          minutes: 0,
          completedAt: undefined,
          workOrderId: "",
          dueAt: m.intervalDays ? Date.now() + m.intervalDays * 86400000 : 0,
          dueHours: m.intervalHours ? a.hours + m.intervalHours : 0,
          dueMiles: m.intervalMiles ? a.miles + m.intervalMiles : 0,
        };
        const task = {
          ...base(f),
          title: next.title,
          description: next.symptoms,
          status: "open" as const,
          priority: "normal" as const,
          dueAt: next.dueAt,
          workerId: next.workerId,
          fieldId: "",
          assetId: next.assetId,
          estimatedMinutes: 0,
          actualMinutes: 0,
          notes: "",
          repeatDays: 0,
        };
        next.workOrderId = task.id;
        f.tasks.push(task);
        o.maintenance.push(next);
      }
      return m.id;
    },
    commandId,
  );
}

export function refreshMaintenanceTasks(f: FarmOS, o: Operations, a: Asset) {
  for (const m of o.maintenance.filter(
    (m) => m.assetId === a.id && maintenanceDue(m, a),
  )) {
    const t = f.tasks.find(
      (t) =>
        t.id === m.workOrderId &&
        t.dueAt === 0 &&
        ["open", "in-progress"].includes(t.status),
    );
    if (t) {
      t.dueAt = Date.now();
      t.updatedAt = Date.now();
    }
  }
}
export function correctMeter(
  d: Data,
  assetId: string,
  hours: number,
  miles: number,
  reason: string,
  confirmed = false,
  commandId = newId(),
) {
  if (!confirmed || !reason.trim())
    throw Error(
      "A meter correction requires an explicit confirmation and reason.",
    );
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(miles) ||
    hours < 0 ||
    miles < 0
  )
    throw Error("Meter values must be nonnegative.");
  return transact(
    d,
    "asset.meter-corrected",
    (f, o) => {
      const a = o.assets.find((a) => a.id === assetId);
      if (!a) throw Error("Asset missing.");
      const row = {
        ...base(f),
        assetId,
        hours,
        miles,
        at: Date.now(),
        notes:
          "Correction: " +
          a.hours +
          "h / " +
          a.miles +
          "mi → " +
          hours +
          "h / " +
          miles +
          "mi. " +
          reason,
      };
      o.meters.push(row);
      a.hours = hours;
      a.miles = miles;
      a.updatedAt = Date.now();
      refreshMaintenanceTasks(f, o, a);
      return row.id;
    },
    commandId,
  );
}
