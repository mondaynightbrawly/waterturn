import React, { useState } from "react";
import type { Data } from "../model";
import { requireFarm } from "./domain";
import { ops } from "./operations";
export function FarmCalendar({ data }: { data: Data }) {
  const f = requireFarm(data),
    o = ops(f);
  const [offset, setOffset] = useState(0),
    [filter, setFilter] = useState("all");
  const events: {
    id: string;
    at: number;
    title: string;
    kind: string;
    state: string;
  }[] = [];
  for (const t of f.tasks.filter((t) => t.dueAt > 0 && !t.archived))
    events.push({
      id: t.id,
      at: t.dueAt,
      title: t.title,
      kind: "tasks",
      state: t.status,
    });
  for (const s of data.sessions.filter(
    (s) => !["completed", "canceled"].includes(s.status),
  ))
    events.push({
      id: s.id,
      at: s.start,
      title: s.label,
      kind: "irrigation",
      state:
        s.status === "planned"
          ? "planned start"
          : s.status + " · recorded start",
    });
  for (const s of o.seasons) {
    const field = data.fields.find((f) => f.id === s.fieldId)?.name;
    for (const [date, kind] of [
      [s.plantedOn, "planting plan"],
      [s.expectedHarvest, "expected harvest"],
    ] as const)
      if (date)
        events.push({
          id: s.id + kind,
          at: +new Date(date + "T12:00:00"),
          title: field + " · " + s.crop,
          kind: "crops",
          state: kind,
        });
  }
  for (const r of o.reproduction) {
    events.push({
      id: r.id,
      at: r.at,
      title: o.animals.find((a) => a.id === r.animalId)?.tag + " · " + r.kind,
      kind: "cattle",
      state: "recorded event",
    });
    if (r.expectedOn)
      events.push({
        id: r.id + "calving",
        at: +new Date(r.expectedOn + "T12:00:00"),
        title:
          "Expected calving · " +
          o.animals.find((a) => a.id === r.animalId)?.tag,
        kind: "cattle",
        state: "estimate",
      });
  }
  for (const h of o.health)
    events.push({
      id: h.id,
      at: h.withdrawalUntil,
      title:
        "Withdrawal date · " +
        (o.animals.find((a) => a.id === h.animalId)?.tag ??
          o.groups.find((g) => g.id === h.groupId)?.name),
      kind: "cattle",
      state: "verify restriction independently; no automatic clearance",
    });
  for (const m of o.maintenance.filter((m) => m.dueAt > 0))
    events.push({
      id: m.id,
      at: m.dueAt,
      title: m.title + " · " + o.assets.find((a) => a.id === m.assetId)?.name,
      kind: "equipment",
      state: m.status,
    });
  return (
    <>
      <div className="toolbar">
        <button onClick={() => setOffset(offset - 7)}>Previous week</button>
        <button onClick={() => setOffset(0)}>Today</button>
        <button onClick={() => setOffset(offset + 7)}>Next week</button>
        <label>
          Calendar module
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["all", "tasks", "irrigation", "crops", "cattle", "equipment"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <div className="week">
        {Array.from({ length: 7 }, (_, i) => {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          start.setDate(start.getDate() + offset + i);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);
          return (
            <section key={i} className="panel compact">
              <h3>
                {start.toLocaleDateString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </h3>
              {events
                .filter(
                  (e) =>
                    e.at >= +start &&
                    e.at < +end &&
                    (filter === "all" || e.kind === filter),
                )
                .sort((a, b) => a.at - b.at)
                .map((e) => (
                  <div className="calendaritem" key={e.id}>
                    <span className="eyebrow">{e.kind}</span>
                    <strong>{e.title}</strong>
                    <p>{e.state}</p>
                  </div>
                ))}
            </section>
          );
        })}
      </div>
      <p className="notice">
        Device-local calendar dates. Planned events do not start water, complete
        work, or clear livestock restrictions. Meter-only service appears on
        Equipment when its reading threshold is reached.
      </p>
    </>
  );
}
