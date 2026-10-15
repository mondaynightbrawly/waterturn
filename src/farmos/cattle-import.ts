import Papa from "papaparse";
import { acquireAnimal, cents, type Animal } from "./operations";
import type { Base } from "./domain";
import type { Data } from "../model";
export function parseCattleCsv(
  text: string,
  groupId: string,
  at = Date.now(),
): Omit<Animal, keyof Base>[] {
  if (text.length > 2000000) throw Error("Cattle CSV exceeds 2 MB.");
  const headers = Papa.parse<string[]>(text, {
    delimiter: ",",
    preview: 1,
  }).data[0]?.map((v) => v.trim());
  if (headers && new Set(headers).size !== headers.length)
    throw Error("Duplicate CSV headers.");
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: ",",
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (result.errors.length)
    throw Error("CSV format error: " + result.errors[0].message);
  const allowed = [
    "tag",
    "eid",
    "breed",
    "sex",
    "bornOn",
    "birthWeightLb",
    "acquisitionCostUSD",
  ];
  if (
    !result.meta.fields?.includes("tag") ||
    result.meta.fields.some((k) => !allowed.includes(k))
  )
    throw Error(
      "Use tag and optional eid, breed, sex, bornOn, birthWeightLb, acquisitionCostUSD headers.",
    );
  if (!result.data.length || result.data.length > 10000)
    throw Error("Import 1–10000 animals at a time.");
  const tags = new Set();
  return result.data.map((r, index) => {
    const tag = r.tag?.trim();
    if (!tag || tags.has(tag))
      throw Error("Missing or duplicate tag at row " + (index + 2));
    tags.add(tag);
    const weight = Number(r.birthWeightLb || 0);
    if (!Number.isFinite(weight) || weight < 0)
      throw Error("Invalid birth weight at row " + (index + 2));
    if (r.bornOn && !/^\d{4}-\d{2}-\d{2}$/.test(r.bornOn))
      throw Error("Birth dates must use YYYY-MM-DD.");
    return {
      tag,
      eid: r.eid ?? "",
      breed: r.breed ?? "",
      sex: r.sex ?? "calf",
      bornOn: r.bornOn ?? "",
      birthWeight: weight,
      groupId,
      sireId: "",
      damId: "",
      acquiredAt: at,
      acquisitionCents: cents(r.acquisitionCostUSD || "0"),
      status: "active",
      notes: "Imported from CSV",
    };
  });
}
export function importCattle(d: Data, rows: Omit<Animal, keyof Base>[]) {
  let next = structuredClone(d);
  for (const row of rows) next = acquireAnimal(next, row);
  return next;
}
