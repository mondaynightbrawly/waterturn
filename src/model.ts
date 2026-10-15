type Metadata = {
  createdAt?: number;
  updatedAt?: number;
  description?: string;
};
export type Source = Metadata & {
  sourceType?: string;
  id: string;
  name: string;
  maxConcurrentSets: number;
  notes: string;
  archived: boolean;
};
export type Field = Metadata & {
  priority?: string;
  id: string;
  name: string;
  acreage: number;
  crop: string;
  method: string;
  sourceId: string;
  duration: number;
  notes: string;
  archived: boolean;
};
export type SetRow = Metadata & {
  acreage?: number;
  id: string;
  fieldId: string;
  name: string;
  order: number;
  duration: number;
  sourceId: string;
  notes: string;
  archived: boolean;
};
export type Session = {
  id: string;
  fieldId: string;
  setId: string;
  sourceId: string;
  label: string;
  sourceName: string;
  start: number;
  end?: number;
  target: number;
  status: "planned" | "active" | "paused" | "completed" | "canceled";
  pauses: { start: number; end?: number }[];
  notes: string;
  capacityOverride: boolean;
  createdAt: number;
  updatedAt: number;
};
export type Settings = {
  farmName: string;
  timeFormat: "12" | "24";
  theme: "light" | "dark" | "system";
  duration: number;
  threshold: number;
  notifications: boolean;
};
export type Data = {
  schemaVersion: 1;
  sources: Source[];
  fields: Field[];
  sets: SetRow[];
  sessions: Session[];
  settings: Settings;
};
export const empty = (): Data => ({
  schemaVersion: 1,
  sources: [],
  fields: [],
  sets: [],
  sessions: [],
  settings: {
    farmName: "My farm",
    timeFormat: "12",
    theme: "system",
    duration: 300,
    threshold: 30,
    notifications: false,
  },
});
export const uid = () => crypto.randomUUID();
export function elapsed(s: Session, now = Date.now()) {
  const end = s.end ?? now;
  return Math.max(
    0,
    end -
      s.start -
      s.pauses.reduce(
        (sum, p) => sum + Math.max(0, (p.end ?? end) - p.start),
        0,
      ),
  );
}
export function remaining(s: Session, now = Date.now()) {
  return s.target * 60000 - elapsed(s, now);
}
export function suggestion(sessions: Session[], setId: string) {
  const values = sessions
    .filter(
      (s) =>
        s.setId === setId &&
        s.status === "completed" &&
        s.end &&
        elapsed(s) > 0,
    )
    .sort((a, b) => (b.end ?? 0) - (a.end ?? 0))
    .slice(0, 5)
    .map((s) => elapsed(s) / 60000)
    .sort((a, b) => a - b);
  if (values.length < 3) return null;
  const n = values.length;
  return {
    minutes:
      Math.round(
        (n % 2 ? values[n >> 1] : (values[n / 2 - 1] + values[n / 2]) / 2) / 5,
      ) * 5,
    count: n,
  };
}
export function validate(d: unknown): asserts d is Data {
  if (!d || typeof d !== "object") throw Error("Backup must be a JSON object.");
  const x = d as Data;
  if (x.schemaVersion !== 1) throw Error("Unsupported backup version.");
  for (const key of ["sources", "fields", "sets", "sessions"] as const) {
    if (!Array.isArray(x[key])) throw Error(`Missing ${key}.`);
    const ids = new Set();
    for (const item of x[key]) {
      if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id))
        throw Error(`Invalid or duplicate ${key} ID.`);
      ids.add(item.id);
    }
  }
  const str = (v: unknown) => typeof v === "string";
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const pos = (v: unknown) => num(v) && (v as number) > 0;
  if (
    !x.settings ||
    !str(x.settings.farmName) ||
    !["12", "24"].includes(x.settings.timeFormat) ||
    !["light", "dark", "system"].includes(x.settings.theme) ||
    !pos(x.settings.duration) ||
    !num(x.settings.threshold) ||
    x.settings.threshold < 0 ||
    typeof x.settings.notifications !== "boolean"
  )
    throw Error("Invalid settings.");
  for (const row of [...x.sources, ...x.fields, ...x.sets]) {
    if (
      (row.description !== undefined && !str(row.description)) ||
      (row.createdAt !== undefined && !num(row.createdAt)) ||
      (row.updatedAt !== undefined && !num(row.updatedAt))
    )
      throw Error("Invalid metadata.");
  }
  for (const row of x.sources)
    if (row.sourceType !== undefined && !str(row.sourceType))
      throw Error("Invalid source type.");
  for (const row of x.fields)
    if (row.priority !== undefined && !str(row.priority))
      throw Error("Invalid priority.");
  for (const row of x.sets)
    if (row.acreage !== undefined && (!num(row.acreage) || row.acreage < 0))
      throw Error("Invalid set acreage.");
  for (const s of x.sources)
    if (
      !str(s.name) ||
      !s.name.trim() ||
      !Number.isInteger(s.maxConcurrentSets) ||
      s.maxConcurrentSets < 1 ||
      !str(s.notes) ||
      typeof s.archived !== "boolean"
    )
      throw Error("Invalid water source.");
  for (const f of x.fields)
    if (
      !str(f.name) ||
      !f.name.trim() ||
      !num(f.acreage) ||
      f.acreage < 0 ||
      !str(f.crop) ||
      !str(f.method) ||
      !str(f.notes) ||
      typeof f.archived !== "boolean" ||
      !pos(f.duration) ||
      !x.sources.some((s) => s.id === f.sourceId)
    )
      throw Error("Invalid field or source reference.");
  for (const s of x.sets)
    if (
      !str(s.name) ||
      !s.name.trim() ||
      !num(s.order) ||
      !pos(s.duration) ||
      !str(s.notes) ||
      typeof s.archived !== "boolean" ||
      !x.fields.some((f) => f.id === s.fieldId) ||
      !x.sources.some((w) => w.id === s.sourceId)
    )
      throw Error("Invalid irrigation set.");
  const active = new Set();
  for (const s of x.sessions) {
    if (
      !x.sets.some((t) => t.id === s.setId && t.fieldId === s.fieldId) ||
      !x.sources.some((w) => w.id === s.sourceId) ||
      !str(s.label) ||
      !str(s.sourceName) ||
      !str(s.notes) ||
      typeof s.capacityOverride !== "boolean" ||
      !pos(s.target) ||
      !num(s.start) ||
      !num(s.createdAt) ||
      !num(s.updatedAt) ||
      !["planned", "active", "paused", "completed", "canceled"].includes(
        s.status,
      ) ||
      !Array.isArray(s.pauses)
    )
      throw Error("Invalid session.");
    if (s.end !== undefined && (!num(s.end) || s.end < s.start))
      throw Error("Invalid end timestamp.");
    if (s.status === "completed" && s.end === undefined)
      throw Error("Completed session needs an end time.");
    if (
      ["active", "paused", "planned"].includes(s.status) &&
      s.end !== undefined
    )
      throw Error("Open session cannot have an end time.");
    let last = s.start;
    for (const [i, p] of s.pauses.entries()) {
      if (
        !num(p.start) ||
        p.start < last ||
        (p.end !== undefined && (!num(p.end) || p.end < p.start)) ||
        (s.end !== undefined && (p.end === undefined || p.end > s.end)) ||
        (p.end === undefined &&
          (s.status !== "paused" || i !== s.pauses.length - 1))
      )
        throw Error("Invalid pause interval.");
      last = p.end ?? p.start;
    }
    if (s.status === "paused" && !s.pauses.some((p) => p.end === undefined))
      throw Error("Paused session needs an open pause.");
    if (["active", "paused"].includes(s.status)) {
      if (active.has(s.setId)) throw Error("Duplicate open session.");
      active.add(s.setId);
    }
  }
}
export function conflicts(
  d: Data,
  setId: string,
  sourceId: string,
  start: number,
  target: number,
  planned: boolean,
  exclude?: string,
) {
  const candidates = d.sessions.filter(
    (s) => s.id !== exclude && !["canceled", "completed"].includes(s.status),
  );
  const duplicate = candidates.filter(
    (s) =>
      s.setId === setId &&
      (planned
        ? s.status === "planned" &&
          s.start < start + target * 60000 &&
          s.start + s.target * 60000 > start
        : s.status !== "planned"),
  );
  const same = candidates.filter(
    (s) =>
      s.sourceId === sourceId &&
      s.status !== "paused" &&
      (planned
        ? s.start < start + target * 60000 &&
          (s.status === "planned"
            ? s.start + s.target * 60000
            : Date.now() + Math.max(0, remaining(s))) > start
        : s.status !== "planned"),
  );
  const capacity =
    d.sources.find((s) => s.id === sourceId)?.maxConcurrentSets ?? 1;
  // Sweep concurrent occupancy rather than counting all disjoint overlapping turns.
  const points = same
    .flatMap(
      (s) =>
        [
          [Math.max(start, s.start), 1],
          [
            Math.min(
              start + target * 60000,
              s.status === "planned"
                ? s.start + s.target * 60000
                : Date.now() + Math.max(0, remaining(s)),
            ),
            -1,
          ],
        ] as [number, number][],
    )
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let peak = 0,
    count = 0;
  for (const [, delta] of points) {
    count += delta;
    peak = Math.max(peak, count);
  }
  return {
    duplicate,
    capacity: planned ? peak >= capacity : same.length >= capacity,
    affected: same,
  };
}
export function startSession(
  d: Data,
  input: {
    setId: string;
    sourceId: string;
    start: number;
    target: number;
    notes: string;
    planned?: boolean;
    override?: boolean;
  },
  exclude?: string,
) {
  const set = d.sets.find((s) => s.id === input.setId && !s.archived);
  const field = d.fields.find((f) => f.id === set?.fieldId && !f.archived);
  const source = d.sources.find((s) => s.id === input.sourceId && !s.archived);
  if (!set || !field || !source)
    throw Error("Choose an available field, set, and source.");
  if (
    !Number.isFinite(input.start) ||
    input.start < 0 ||
    !Number.isFinite(input.target) ||
    input.target <= 0 ||
    (!input.planned && input.start > Date.now() + 1000)
  )
    throw Error(
      "Enter a valid start time and positive duration. Actual water cannot start in the future.",
    );
  const c = conflicts(
    d,
    set.id,
    source.id,
    input.start,
    input.target,
    !!input.planned,
    exclude,
  );
  if (c.duplicate.length)
    throw Error("This set already has an active or overlapping planned turn.");
  if (c.capacity && !input.override)
    throw Error("Capacity confirmation required.");
  const now = Date.now();
  const s: Session = {
    id: uid(),
    fieldId: field.id,
    setId: set.id,
    sourceId: source.id,
    label: `${field.name} · ${set.name}`,
    sourceName: source.name,
    start: input.start,
    target: input.target,
    status: input.planned ? "planned" : "active",
    pauses: [],
    notes: input.notes,
    capacityOverride: !!input.override,
    createdAt: now,
    updatedAt: now,
  };
  d.sessions.push(s);
  return s;
}
export function stopSession(s: Session, at = Date.now()) {
  if (
    !["active", "paused"].includes(s.status) ||
    at < s.start ||
    s.pauses.some((p) => p.start > at || (p.end ?? at) > at)
  )
    throw Error("End time must follow the start and all pauses.");
  for (const p of s.pauses) if (p.end === undefined) p.end = at;
  s.end = at;
  s.status = "completed";
  s.updatedAt = Date.now();
}
export function moveSession(
  d: Data,
  id: string,
  input: Parameters<typeof startSession>[1],
) {
  const next = structuredClone(d);
  const old = next.sessions.find((s) => s.id === id);
  if (!old) throw Error("Session missing.");
  stopSession(old, input.start);
  startSession(next, { ...input, planned: false });
  validate(next);
  return next;
}
export function csv(d: Data) {
  const quote = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    [
      "Field / set",
      "Source",
      "Status",
      "Started",
      "Ended",
      "Actual minutes",
      "Target minutes",
      "Difference minutes",
      "Notes",
    ],
    ...d.sessions
      .filter((s) => ["completed", "canceled"].includes(s.status))
      .map((s) => [
        s.label,
        s.sourceName,
        s.status,
        new Date(s.start).toISOString(),
        s.end ? new Date(s.end).toISOString() : "",
        s.end ? elapsed(s) / 60000 : "",
        s.target,
        s.end ? elapsed(s) / 60000 - s.target : "",
        s.notes,
      ]),
  ]
    .map((r) => r.map(quote).join(","))
    .join("\r\n");
}
