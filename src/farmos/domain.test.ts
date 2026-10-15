import { beforeEach, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import { demo } from "../demo";
import { validate, empty } from "../model";
import {
  upgrade,
  requireFarm,
  base,
  completeTask,
  prepareOrganizationImport,
} from "./domain";
import { db, load, save, originalBackup, clearLocalData } from "../storage";
beforeEach(async () => {
  vi.restoreAllMocks();
  await db.state.clear();
  await db.backups.clear();
  await load();
});
it("migrates legacy irrigation exactly and retains original rollback backup", async () => {
  const legacy = demo();
  await db.state.put({ ...legacy, id: "farm" });
  const d = await load();
  expect(d.schemaVersion).toBe(2);
  expect(d.sessions).toEqual(legacy.sessions);
  expect(d.fields).toEqual(legacy.fields);
  expect(d.sets).toEqual(legacy.sets);
  expect(d.sources).toEqual(legacy.sources);
  expect(await originalBackup()).toEqual(legacy);
  expect(await load()).toEqual(d);
});
it("failed migration backup aborts without changing legacy data", async () => {
  const legacy = demo();
  await db.state.put({ ...legacy, id: "farm" });
  const spy = vi
    .spyOn(db.backups, "put")
    .mockRejectedValue(new Error("Quota exceeded"));
  await expect(load()).rejects.toThrow("Quota");
  spy.mockRestore();
  expect((await db.state.get("farm"))?.schemaVersion).toBe(1);
});
it("validates tenant references and full version2 roundtrip", async () => {
  const d = upgrade(demo());
  const f = requireFarm(d);
  f.properties.push({
    ...base(f),
    name: "Fictional west ranch",
    acreage: 95,
    notes: "",
  });
  f.fieldProperties[d.fields[0].id] = f.properties[0].id;
  const result = await save(d);
  expect(await load()).toEqual(result);
  const copy = JSON.parse(JSON.stringify(result));
  validate(copy);
  copy.farm!.properties[0].organizationId = "other";
  expect(() => validate(copy)).toThrow(/organization/);
});
it("task completion and recurring next work are idempotent", () => {
  const d = upgrade(demo());
  const f = requireFarm(d);
  const t = {
    ...base(f),
    title: "Clean headgate",
    description: "Fictional",
    status: "open" as const,
    priority: "high" as const,
    dueAt: Date.now(),
    workerId: "",
    fieldId: d.fields[0].id,
    assetId: "",
    estimatedMinutes: 30,
    actualMinutes: 0,
    notes: "",
    repeatDays: 7,
  };
  f.tasks.push(t);
  completeTask(d, t.id, 25, "Done", "command-1");
  completeTask(d, t.id, 25, "Done", "command-1");
  expect(f.tasks).toHaveLength(2);
  expect(f.activities.filter((a) => a.kind === "task.completed")).toHaveLength(
    1,
  );
  expect(f.tasks[0].actualMinutes).toBe(25);
  expect(f.tasks[1].status).toBe("open");
  validate(d);
});

it("explicit empty-organization import preserves history and does not mutate either farm", () => {
  const source = upgrade(demo()),
    target = upgrade(empty());
  const targetOrg = requireFarm(target).organization.id;
  const original = JSON.stringify(source);
  const result = prepareOrganizationImport(source, target);
  expect(requireFarm(result).organization.id).toBe(targetOrg);
  expect(result.sessions).toEqual(source.sessions);
  expect(result.fields).toEqual(source.fields);
  expect(JSON.stringify(source)).toBe(original);
  validate(result);
  expect(() => prepareOrganizationImport(source, result)).toThrow(/not empty/);
});

it("explicit local clear removes records, migration backups and pending snapshots atomically", async () => {
  const legacy = demo();
  await db.state.put({ ...legacy, id: "farm" });
  const d = await load();
  await db.sync.put({
    organizationId: requireFarm(d).organization.id,
    endpoint: "http://127.0.0.1:8787",
    baseRevision: 1,
    commandId: "pending-clear-test",
    status: "pending-sync",
    data: d,
    error: "",
    updatedAt: Date.now(),
  });
  await clearLocalData();
  expect((await load()).fields).toHaveLength(0);
  expect(await db.backups.count()).toBe(0);
  expect(await db.sync.count()).toBe(0);
});
