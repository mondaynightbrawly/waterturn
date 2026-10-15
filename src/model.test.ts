import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  empty,
  startSession,
  stopSession,
  moveSession,
  elapsed,
  remaining,
  suggestion,
  validate,
  conflicts,
  csv,
  type Data,
} from "./model";
import { save, load, db } from "./storage";
let d: Data;
const now = Date.UTC(2026, 9, 15, 18);
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  d = empty();
  d.sources = [
    {
      id: "w",
      name: "Canal",
      maxConcurrentSets: 1,
      notes: "",
      archived: false,
    },
  ];
  d.fields = [
    {
      id: "f",
      name: "North",
      acreage: 40,
      crop: "Corn",
      method: "Furrow",
      sourceId: "w",
      duration: 300,
      notes: "",
      archived: false,
    },
  ];
  d.sets = ["a", "b", "c"].map((id, order) => ({
    id,
    fieldId: "f",
    name: id,
    order,
    duration: 300,
    sourceId: "w",
    notes: "",
    archived: false,
  }));
});
const input = (setId = "a", extra = {}) => ({
  setId,
  sourceId: "w",
  start: now - 3600000,
  target: 300,
  notes: "",
  ...extra,
});
describe("timers", () => {
  it("derives elapsed after reopening and editing, and remains active when overdue", () => {
    const s = startSession(d, input());
    expect(elapsed(s, now)).toBe(3600000);
    s.start -= 3600000;
    expect(elapsed(JSON.parse(JSON.stringify(s)), now)).toBe(7200000);
    expect(remaining(s, now + 8 * 3600000)).toBeLessThan(0);
    expect(s.status).toBe("active");
  });
  it.each([
    ["overnight", "2026-10-15T23:30:00Z", "2026-10-16T01:30:00Z"],
    ["DST spring", "2026-03-08T01:30:00-07:00", "2026-03-08T04:30:00-06:00"],
    ["DST fall", "2026-11-01T00:30:00-06:00", "2026-11-01T01:30:00-07:00"],
  ])("handles %s", (_, start, end) => {
    const s = startSession(
      d,
      input("a", { start: +new Date(start), planned: true }),
    );
    s.status = "completed";
    s.end = +new Date(end);
    expect(elapsed(s)).toBe(7200000);
  });
  it("excludes pause intervals including an ongoing pause", () => {
    const s = startSession(d, input());
    s.status = "paused";
    s.pauses = [{ start: now - 1800000 }];
    expect(elapsed(s, now)).toBe(1800000);
    s.pauses[0].end = now;
    s.status = "active";
    expect(elapsed(s, now + 60000)).toBe(1860000);
  });
});
describe("sessions", () => {
  it("stops with a valid actual duration", () => {
    const s = startSession(d, input());
    stopSession(s, now);
    expect(s.status).toBe("completed");
    expect(elapsed(s)).toBe(3600000);
    expect(() =>
      stopSession(startSession(d, input("b")), now - 7200000),
    ).toThrow();
  });
  it("prevents duplicate sessions and requires source override", () => {
    startSession(d, input());
    expect(() => startSession(d, input())).toThrow(/already/);
    expect(() => startSession(d, input("b"))).toThrow(/Capacity/);
    expect(
      startSession(d, input("b", { override: true })).capacityOverride,
    ).toBe(true);
  });
  it("moves consistently and preserves original data on failure", () => {
    const s = startSession(d, input());
    const result = moveSession(d, s.id, input("b", { start: now }));
    expect(result.sessions[0].end).toBe(now);
    expect(result.sessions[1].start).toBe(now);
    expect(d.sessions[0].status).toBe("active");
    expect(() => moveSession(d, s.id, input("missing"))).toThrow();
    expect(d.sessions.length).toBe(1);
  });
  it("preserves display snapshots and archived history", () => {
    const s = startSession(d, input());
    stopSession(s, now);
    d.fields[0].name = "Renamed";
    d.fields[0].archived = true;
    expect(s.label).toBe("North · a");
    validate(d);
  });
});
it("releases capacity on pause but prevents another open turn on the same set", () => {
  const s = startSession(d, input());
  s.status = "paused";
  s.pauses = [{ start: now }];
  expect(conflicts(d, "b", "w", now, 300, false).capacity).toBe(false);
  expect(() => startSession(d, input())).toThrow(/already/);
  startSession(d, input("b"));
  expect(conflicts(d, "a", "w", now, 300, false, s.id).capacity).toBe(true);
});
describe("schedule", () => {
  it("keeps plans separate and detects overlaps across midnight", () => {
    const start = Date.UTC(2026, 9, 15, 23);
    const s = startSession(
      d,
      input("a", { start, target: 180, planned: true }),
    );
    expect(s.status).toBe("planned");
    expect(conflicts(d, "b", "w", start + 3600000, 120, true).capacity).toBe(
      true,
    );
    expect(
      conflicts(d, "b", "w", start + 4 * 3600000, 120, true).capacity,
    ).toBe(false);
  });
  it("uses peak concurrency rather than counting disjoint intervals", () => {
    d.sources[0].maxConcurrentSets = 2;
    startSession(d, input("a", { start: now, target: 60, planned: true }));
    startSession(
      d,
      input("b", { start: now + 3600000, target: 60, planned: true }),
    );
    expect(conflicts(d, "c", "w", now, 120, true).capacity).toBe(false);
  });
});
describe("suggestions", () => {
  it("requires three qualifying sessions, uses last five median and rounds", () => {
    [300, 310, 327, 340, 900, 350].forEach((minutes, i) => {
      const s = startSession(
        d,
        input("a", { start: now - (10 - i) * 86400000, planned: true }),
      );
      s.status = i === 0 ? "canceled" : "completed";
      s.end = s.start + minutes * 60000;
    });
    expect(suggestion(d.sessions, "a")).toEqual({ minutes: 340, count: 5 });
    d.sessions = d.sessions.slice(0, 3);
    expect(suggestion(d.sessions, "a")).toBeNull();
  });
});
describe("storage and backups", () => {
  it("persists, roundtrips backups, and rejects invalid replacement without losing records", async () => {
    await db.state.clear();
    startSession(d, input());
    const saved = await save(d);
    expect(await load()).toEqual(saved);
    const restored = JSON.parse(JSON.stringify(d));
    validate(restored);
    await save(restored);
    const broken = { ...d, schemaVersion: 99 };
    expect(() => validate(broken)).toThrow();
    await expect(save(broken as Data)).rejects.toThrow();
    expect((await load()).sessions.length).toBe(1);
  });
  it("rejects stale tab writes without overwriting external changes", async () => {
    await db.state.clear();
    await load();
    await save(d);
    const external = structuredClone(d);
    external.settings.farmName = "Another tab";
    await db.state.put({ ...external, id: "farm" });
    await expect(save(d)).rejects.toThrow(/another tab/);
    expect((await load()).settings.farmName).toBe("Another tab");
  });
  it("rejects dangling references, duplicate IDs and corrupt timestamps", () => {
    startSession(d, input());
    for (const mutate of [
      (x: Data) => {
        x.sessions[0].setId = "bad";
      },
      (x: Data) => {
        x.sources.push(x.sources[0]);
      },
      (x: Data) => {
        x.sessions[0].end = 0;
      },
    ]) {
      const x = structuredClone(d);
      mutate(x);
      expect(() => validate(x)).toThrow();
    }
  });
  it("exports CSV with quoted text and formula mitigation", () => {
    const s = startSession(d, input("a", { notes: "=SUM(1,2)" }));
    stopSession(s, now);
    expect(csv(d)).toContain("'=SUM(1,2)");
    expect(csv(d)).toContain("Actual minutes");
  });
});
