import Dexie, { type Table } from "dexie";
import { empty, validate, type Data } from "./model";
import type { SyncRecord } from "./farmos/sync";
import { upgrade, irrigationActivities } from "./farmos/domain";
class Store extends Dexie {
  state!: Table<Data & { id: string }, string>;
  sync!: Table<SyncRecord, string>;
  backups!: Table<{ id: string; data: Data; createdAt: number }, string>;
  constructor() {
    super("waterturn");
    this.version(1).stores({ state: "id" });
    this.version(2).stores({ state: "id", backups: "id" });
    this.version(3).stores({
      state: "id",
      backups: "id",
      sync: "organizationId",
    });
  }
}
export const db = new Store();
let expected: string | undefined;
export async function load() {
  return db.transaction("rw", db.state, db.backups, async () => {
    const row = await db.state.get("farm");
    if (!row) {
      expected = undefined;
      return upgrade(empty());
    }
    const { id: _, ...data } = row;
    validate(data);
    let result = data;
    if (data.schemaVersion === 1) {
      result = upgrade(data);
      validate(result);
      await db.backups.put({
        id: "before-farmos-v2",
        data,
        createdAt: Date.now(),
      });
      await db.state.put({ ...result, id: "farm" });
    }
    expected = JSON.stringify({ ...result, id: "farm" });
    return result;
  });
}
export async function originalBackup() {
  return (await db.backups.get("before-farmos-v2"))?.data;
}
export async function save(data: Data) {
  validate(data);
  const result = upgrade(data);
  validate(result);
  await db.transaction("rw", db.state, db.backups, db.sync, async () => {
    const current = await db.state.get("farm");
    if (JSON.stringify(current) !== expected)
      throw Error(
        "Farm data changed in another tab. Reload before editing to preserve those changes.",
      );
    if (current && data.schemaVersion === 1)
      await db.backups.put({
        id: "before-last-legacy-import",
        data,
        createdAt: Date.now(),
      });
    // Full backup replacements bring their own history; ordinary edits record irrigation changes.
    if (
      current?.farm &&
      result.farm?.organization.id === current.farm.organization.id
    )
      irrigationActivities(current, result);
    validate(result);
    await db.state.put({ ...result, id: "farm" });
    const orgId = result.farm!.organization.id;
    const sync = await db.sync.get(orgId);
    if (sync?.status === "synchronized")
      await db.sync.put({
        ...sync,
        status: "saved-local",
        updatedAt: Date.now(),
      });
  });
  expected = JSON.stringify({ ...result, id: "farm" });
  return result;
}

/** Explicitly confirmed deletion includes migration backups and queued private snapshots. */
export async function clearLocalData() {
  const result = upgrade(empty());
  await db.transaction("rw", db.state, db.backups, db.sync, async () => {
    const current = await db.state.get("farm");
    if (JSON.stringify(current) !== expected)
      throw Error("Farm data changed in another tab. Reload before clearing.");
    await db.state.put({ ...result, id: "farm" });
    await db.backups.clear();
    await db.sync.clear();
  });
  expected = JSON.stringify({ ...result, id: "farm" });
  return result;
}
