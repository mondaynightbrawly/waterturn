import type { PoolClient } from "pg";
import { validate, type Data } from "../src/model.ts";
import { requireFarm } from "../src/farmos/domain.ts";
import { operationKeys, ops } from "../src/farmos/operations.ts";
const farmKeys = ["properties", "workers", "tasks", "activities"] as const;
export async function readState(
  client: PoolClient,
  organizationId: string,
): Promise<{ data: Data; revision: number }> {
  const row = (
    await client.query("SELECT meta,revision FROM organizations WHERE id=$1", [
      organizationId,
    ])
  ).rows[0];
  if (!row) throw Error("Organization missing.");
  const d = structuredClone(row.meta) as Data;
  const f = requireFarm(d);
  for (const key of ["sources", "fields", "sets", "sessions"] as const)
    d[key] = [];
  for (const key of farmKeys) (f[key] as unknown[]) = [];
  for (const key of operationKeys) (ops(f)[key] as unknown[]) = [];
  const records = await client.query(
    "SELECT kind,payload FROM records WHERE organization_id=$1 ORDER BY kind,position,id",
    [organizationId],
  );
  for (const r of records.rows) {
    if (["sources", "fields", "sets", "sessions"].includes(r.kind))
      (d[r.kind as "fields"] as unknown[]).push(r.payload);
    else if (farmKeys.includes(r.kind))
      (f[r.kind as "tasks"] as unknown[]).push(r.payload);
    else if (operationKeys.includes(r.kind))
      (ops(f)[r.kind as "assets"] as unknown[]).push(r.payload);
  }
  validate(d);
  return { data: d, revision: Number(row.revision) };
}
export async function writeState(
  client: PoolClient,
  d: Data,
  organizationId: string,
) {
  validate(d);
  const f = requireFarm(d);
  if (f.organization.id !== organizationId)
    throw Error("Cross-organization replacement forbidden.");
  const meta = structuredClone(d),
    mf = requireFarm(meta);
  const records: { kind: string; id: string; payload: unknown }[] = [];
  for (const key of ["sources", "fields", "sets", "sessions"] as const) {
    for (const r of d[key]) records.push({ kind: key, id: r.id, payload: r });
    meta[key] = [];
  }
  for (const key of farmKeys) {
    for (const r of f[key]) records.push({ kind: key, id: r.id, payload: r });
    (mf[key] as unknown[]) = [];
  }
  for (const key of operationKeys) {
    for (const r of ops(f)[key])
      records.push({ kind: key, id: r.id, payload: r });
    (ops(mf)[key] as unknown[]) = [];
  }
  await client.query("DELETE FROM record_links WHERE organization_id=$1", [
    organizationId,
  ]);
  // Upserts retain unchanged record versions; removals are represented in the new organization revision.
  for (const [position, r] of records.entries())
    await client.query(
      "INSERT INTO records(organization_id,kind,id,payload,position)VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,kind,id)DO UPDATE SET payload=EXCLUDED.payload,position=EXCLUDED.position,version=CASE WHEN records.payload=EXCLUDED.payload THEN records.version ELSE records.version+1 END",
      [organizationId, r.kind, r.id, JSON.stringify(r.payload), position],
    );
  const keys = records.map((r) => r.kind + "\t" + r.id);
  await client.query(
    "DELETE FROM records WHERE organization_id=$1 AND NOT(kind||E'\\t'||id=ANY($2::text[]))",
    [organizationId, keys],
  );
  const refs: Record<string, string> = {
    fieldId: "fields",
    setId: "sets",
    sourceId: "sources",
    sourceOverrideId: "sources",
    defaultSourceId: "sources",
    workerId: "workers",
    assetId: "assets",
    seasonId: "seasons",
    enterpriseId: "enterprises",
    itemId: "items",
    inputItemId: "items",
    lotId: "lots",
    animalId: "animals",
    groupId: "groups",
    sireId: "animals",
    damId: "animals",
    calfId: "animals",
    fromGroupId: "groups",
    toGroupId: "groups",
    workOrderId: "tasks",
  };
  for (const r of records) {
    for (const [key, val] of Object.entries(r.payload as object)) {
      if (!val || typeof val !== "string" || !refs[key]) continue;
      await client.query(
        "INSERT INTO record_links VALUES($1,$2,$3,$4,$5,$6)ON CONFLICT DO NOTHING",
        [organizationId, r.kind, r.id, key, refs[key], val],
      );
    }
  }
  for (const j of ops(f).journals) {
    await client.query(
      "INSERT INTO ledger_journals VALUES($1,$2,$3,$4)ON CONFLICT DO NOTHING",
      [organizationId, j.id, new Date(j.at), j.description],
    );
    for (const [i, p] of j.postings.entries())
      await client.query(
        "INSERT INTO ledger_postings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)ON CONFLICT DO NOTHING",
        [
          organizationId,
          j.id,
          i,
          p.account,
          p.cents,
          p.enterpriseId,
          p.fieldId,
          p.groupId,
          p.assetId,
          p.animalId,
        ],
      );
  }
  const result = await client.query(
    "UPDATE organizations SET name=$2,meta=$3,revision=revision+1 WHERE id=$1 RETURNING revision",
    [organizationId, f.organization.name, JSON.stringify(meta)],
  );
  return Number(result.rows[0].revision);
}
export async function writeTaskChanges(
  client: PoolClient,
  before: Data,
  after: Data,
  organizationId: string,
) {
  const old = requireFarm(before),
    next = requireFarm(after);
  for (const [key, rows, previous] of [
    ["tasks", next.tasks, old.tasks],
    ["activities", next.activities, old.activities],
  ] as const) {
    for (const [position, row] of rows.entries()) {
      const existing = previous.find((p) => p.id === row.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(row))
        continue;
      await client.query(
        "INSERT INTO records(organization_id,kind,id,payload,position)VALUES($1,$2,$3,$4,$5)ON CONFLICT(organization_id,kind,id)DO UPDATE SET payload=EXCLUDED.payload,position=EXCLUDED.position,version=records.version+1",
        [organizationId, key, row.id, JSON.stringify(row), position],
      );
      if (key === "tasks") {
        for (const [relation, target] of [
          ["fieldId", "fields"],
          ["workerId", "workers"],
          ["assetId", "assets"],
        ] as const) {
          const id = (row as unknown as Record<string, string>)[relation];
          if (id)
            await client.query(
              "INSERT INTO record_links VALUES($1,$2,$3,$4,$5,$6)ON CONFLICT DO NOTHING",
              [organizationId, key, row.id, relation, target, id],
            );
        }
      }
    }
  }
  const result = await client.query(
    "UPDATE organizations SET revision=revision+1,meta=jsonb_set(meta,'{farm,receipts}',$2::jsonb)WHERE id=$1 RETURNING revision",
    [organizationId, JSON.stringify(next.receipts)],
  );
  return Number(result.rows[0].revision);
}
