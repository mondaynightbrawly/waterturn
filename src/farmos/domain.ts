import { validateOperations, type Operations } from "./operations";
import type { Data } from "../model";
export type Base = {
  id: string;
  organizationId: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
};
export type Property = Base & { name: string; acreage: number; notes: string };
export type Worker = Base & {
  name: string;
  kind: "owner" | "employee" | "contractor" | "family";
};
export type Task = Base & {
  title: string;
  description: string;
  status: "open" | "in-progress" | "completed" | "canceled";
  priority: "low" | "normal" | "high";
  dueAt: number;
  workerId: string;
  fieldId: string;
  assetId: string;
  estimatedMinutes: number;
  actualMinutes: number;
  notes: string;
  completedAt?: number;
  repeatDays: number;
  parentTaskId?: string;
};
export type Activity = {
  id: string;
  organizationId: string;
  at: number;
  kind: string;
  summary: string;
  entityId: string;
  fieldId: string;
  commandId: string;
};
export type FarmOS = {
  operations?: Operations;
  organization: { id: string; name: string; timezone: string; currency: "USD" };
  properties: Property[];
  fieldProperties: Record<string, string>;
  workers: Worker[];
  tasks: Task[];
  activities: Activity[];
  receipts: string[];
  widgets: string[];
};
export const newId = (): string => crypto.randomUUID();
export function base(f: FarmOS): Base {
  const at = Date.now();
  return {
    id: newId(),
    organizationId: f.organization.id,
    createdAt: at,
    updatedAt: at,
    archived: false,
  };
}
export function upgrade(data: Data): Data {
  const d = structuredClone(data);
  if (d.schemaVersion === 2) return d;
  if (d.schemaVersion !== 1) throw Error("Unsupported backup version.");
  d.schemaVersion = 2;
  d.farm = {
    organization: {
      id: newId(),
      name: d.settings.farmName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      currency: "USD",
    },
    properties: [],
    fieldProperties: {},
    workers: [],
    tasks: [],
    activities: [],
    receipts: [],
    widgets: ["irrigation", "tasks", "acreage", "activity"],
  };
  return d;
}
export function requireFarm(d: Data): FarmOS {
  if (d.schemaVersion !== 2 || !d.farm)
    throw Error("FarmOS migration required.");
  return d.farm;
}
export function activity(
  f: FarmOS,
  kind: string,
  summary: string,
  entityId: string,
  fieldId = "",
  commandId = newId(),
) {
  if (f.receipts.includes(commandId)) return;
  f.activities.push({
    id: newId(),
    organizationId: f.organization.id,
    at: Date.now(),
    kind,
    summary,
    entityId,
    fieldId,
    commandId,
  });
  f.receipts.push(commandId);
}
export function completeTask(
  d: Data,
  id: string,
  minutes: number,
  notes: string,
  commandId = newId(),
) {
  const f = requireFarm(d);
  if (f.receipts.includes(commandId)) return;
  const t = f.tasks.find((t) => t.id === id);
  if (!t || !["open", "in-progress"].includes(t.status))
    throw Error("Task is not open.");
  if (!Number.isFinite(minutes) || minutes < 0)
    throw Error("Work time must be nonnegative.");
  t.status = "completed";
  t.actualMinutes = minutes;
  t.notes = notes;
  t.completedAt = Date.now();
  t.updatedAt = Date.now();
  activity(f, "task.completed", t.title, id, t.fieldId, commandId);
  if (t.repeatDays > 0) {
    const next = structuredClone(t);
    Object.assign(next, base(f), {
      status: "open",
      completedAt: undefined,
      actualMinutes: 0,
      notes: "",
      parentTaskId: t.id,
    });
    const date = new Date(t.dueAt);
    date.setDate(date.getDate() + t.repeatDays);
    next.dueAt = +date;
    f.tasks.push(next);
  }
}
export function irrigationActivities(before: Data, after: Data) {
  if (!after.farm) return;
  for (const s of after.sessions) {
    const old = before.sessions.find((p) => p.id === s.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(s))
      activity(
        after.farm,
        "irrigation." + s.status,
        s.label + " · " + s.status,
        s.id,
        s.fieldId,
      );
  }
}
export function validateFarm(value: unknown, d: Data): asserts value is FarmOS {
  if (!value || typeof value !== "object") throw Error("Missing FarmOS data.");
  const f = value as FarmOS;
  const text = (v: unknown) => typeof v === "string";
  const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const nonnegative = (v: unknown) => number(v) && (v as number) >= 0;
  if (
    !f.organization ||
    !text(f.organization.id) ||
    !f.organization.id ||
    !text(f.organization.name) ||
    !f.organization.name.trim() ||
    !text(f.organization.timezone) ||
    f.organization.currency !== "USD"
  )
    throw Error("Invalid farm organization.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: f.organization.timezone });
  } catch {
    throw Error("Invalid farm time zone.");
  }
  if (f.operations !== undefined) validateOperations(f.operations, d, f);
  for (const key of ["properties", "workers", "tasks", "activities"] as const) {
    if (!Array.isArray(f[key])) throw Error("Missing " + key);
    const ids = new Set<string>();
    for (const row of f[key]) {
      if (
        !row ||
        !text(row.id) ||
        !row.id ||
        ids.has(row.id) ||
        row.organizationId !== f.organization.id
      )
        throw Error("Invalid or cross-organization " + key);
      ids.add(row.id);
    }
  }
  for (const row of [...f.properties, ...f.workers, ...f.tasks])
    if (
      !number(row.createdAt) ||
      !number(row.updatedAt) ||
      typeof row.archived !== "boolean"
    )
      throw Error("Invalid record metadata.");
  for (const p of f.properties)
    if (
      !text(p.name) ||
      !p.name.trim() ||
      !nonnegative(p.acreage) ||
      !text(p.notes)
    )
      throw Error("Invalid property.");
  if (
    !f.fieldProperties ||
    typeof f.fieldProperties !== "object" ||
    Array.isArray(f.fieldProperties)
  )
    throw Error("Invalid field properties.");
  for (const [fieldId, propertyId] of Object.entries(f.fieldProperties))
    if (
      !d.fields.some((t) => t.id === fieldId) ||
      !f.properties.some((p) => p.id === propertyId)
    )
      throw Error("Invalid field/property reference.");
  for (const w of f.workers)
    if (
      !text(w.name) ||
      !w.name.trim() ||
      !["owner", "employee", "contractor", "family"].includes(w.kind)
    )
      throw Error("Invalid worker.");
  for (const t of f.tasks)
    if (
      !text(t.title) ||
      !t.title.trim() ||
      !text(t.description) ||
      !text(t.notes) ||
      !["open", "in-progress", "completed", "canceled"].includes(t.status) ||
      !["low", "normal", "high"].includes(t.priority) ||
      !number(t.dueAt) ||
      !nonnegative(t.estimatedMinutes) ||
      !nonnegative(t.actualMinutes) ||
      !Number.isInteger(t.repeatDays) ||
      t.repeatDays < 0 ||
      !text(t.fieldId) ||
      (t.fieldId && !d.fields.some((p) => p.id === t.fieldId)) ||
      !text(t.workerId) ||
      (t.workerId && !f.workers.some((p) => p.id === t.workerId)) ||
      !text(t.assetId) ||
      (t.assetId && !f.operations?.assets.some((a) => a.id === t.assetId)) ||
      (t.status === "completed" && !number(t.completedAt))
    )
      throw Error("Invalid task or reference.");
  for (const a of f.activities)
    if (
      !number(a.at) ||
      !text(a.kind) ||
      !text(a.summary) ||
      !text(a.entityId) ||
      !text(a.fieldId) ||
      !text(a.commandId) ||
      (a.fieldId && !d.fields.some((p) => p.id === a.fieldId))
    )
      throw Error("Invalid activity.");
  if (
    !Array.isArray(f.receipts) ||
    !f.receipts.every(text) ||
    new Set(f.receipts).size !== f.receipts.length ||
    !Array.isArray(f.widgets) ||
    !f.widgets.every((x) =>
      [
        "irrigation",
        "tasks",
        "acreage",
        "activity",
        "equipment",
        "inventory",
        "cattle",
      ].includes(x),
    )
  )
    throw Error("Invalid farm preferences.");
}

/** Explicit owner import preparation; never a cross-tenant merge. */
export function prepareOrganizationImport(source: Data, target: Data): Data {
  const destination = requireFarm(target);
  const targetOps = destination.operations;
  if (
    target.fields.length ||
    target.sets.length ||
    target.sources.length ||
    target.sessions.length ||
    destination.properties.length ||
    destination.workers.length ||
    destination.tasks.length ||
    destination.activities.length ||
    (targetOps && Object.values(targetOps).some((rows) => rows.length))
  )
    throw Error(
      "Destination organization is not empty. Merge is not supported; use a separate reviewed migration.",
    );
  const copy = upgrade(source),
    farm = requireFarm(copy);
  farm.organization = { ...destination.organization };
  copy.settings.farmName = destination.organization.name;
  for (const rows of [
    farm.properties,
    farm.workers,
    farm.tasks,
    farm.activities,
    ...Object.values(farm.operations ?? {}),
  ])
    for (const record of rows)
      record.organizationId = destination.organization.id;
  return copy;
}
