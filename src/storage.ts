import Dexie, { type Table } from "dexie";
import { empty, validate, type Data } from "./model";
class Store extends Dexie {
  state!: Table<Data & { id: string }, string>;
  constructor() {
    super("waterturn");
    this.version(1).stores({ state: "id" });
  }
}
export const db = new Store();
let expected: string | undefined;
export async function load() {
  const row = await db.state.get("farm");
  expected = JSON.stringify(row);
  if (!row) return empty();
  const { id: _, ...data } = row;
  validate(data);
  return data;
}
export async function save(data: Data) {
  validate(data);
  await db.transaction("rw", db.state, async () => {
    const current = await db.state.get("farm");
    if (JSON.stringify(current) !== expected)
      throw Error(
        "Farm data changed in another tab. Reload before editing to preserve those changes.",
      );
    await db.state.put({ ...data, id: "farm" });
  });
  expected = JSON.stringify({ ...data, id: "farm" });
}
