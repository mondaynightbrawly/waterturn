import Decimal from "decimal.js";
import type { Data } from "../../model";
import { type FarmOS } from "../domain";
import { validateRing } from "../geometry";
import { accountBalance } from "./ledger";
import { operationKeys, units, type Operations } from "./types";
export function validateOperations(
  value: unknown,
  d: Data,
  f: FarmOS,
): asserts value is Operations {
  if (!value || typeof value !== "object")
    throw Error("Invalid operations data.");
  const o = value as Operations;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const nonneg = (v: unknown) => num(v) && (v as number) >= 0;
  const money = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
  const str = (v: unknown) => typeof v === "string";
  const text = (v: unknown) => str(v) && !!(v as string).trim();
  for (const key of operationKeys) {
    if (key === "rations" && o[key] === undefined) continue;
    if (!Array.isArray(o[key])) throw Error("Missing operations table: " + key);
    const ids = new Set();
    for (const r of o[key]) {
      if (
        !r ||
        !text(r.id) ||
        ids.has(r.id) ||
        r.organizationId !== f.organization.id ||
        !num(r.createdAt) ||
        !num(r.updatedAt) ||
        typeof r.archived !== "boolean"
      )
        throw Error("Invalid " + key + " record or organization.");
      ids.add(r.id);
    }
  }
  const ref = (rows: { id: string }[], id: unknown, optional = false) =>
    str(id) && ((optional && !id) || rows.some((r) => r.id === id));
  for (const r of o.rations ?? [])
    if (
      !text(r.name) ||
      !Array.isArray(r.ingredients) ||
      !r.ingredients.length ||
      new Set(r.ingredients.map((i) => i.itemId)).size !==
        r.ingredients.length ||
      r.ingredients.some(
        (i) =>
          !ref(o.items, i.itemId) || !nonneg(i.quantity) || i.quantity === 0,
      ) ||
      !str(r.notes)
    )
      throw Error("Invalid ration.");
  for (const e of o.enterprises)
    if (
      !text(e.name) ||
      !["crop", "cattle", "other"].includes(e.kind) ||
      !Number.isInteger(e.year) ||
      !money(e.budgetCents)
    )
      throw Error("Invalid enterprise.");
  for (const a of o.assets)
    if (
      !text(a.name) ||
      !str(a.category) ||
      !str(a.make) ||
      !str(a.model) ||
      !str(a.serial) ||
      !str(a.location) ||
      !str(a.notes) ||
      !Number.isInteger(a.year) ||
      !nonneg(a.hours) ||
      !nonneg(a.miles) ||
      !money(a.purchaseCents) ||
      !["available", "out-of-service", "retired"].includes(a.status)
    )
      throw Error("Invalid equipment asset.");
  for (const i of o.items)
    if (
      !text(i.name) ||
      !str(i.category) ||
      !units.includes(i.unit) ||
      !nonneg(i.lowStock)
    )
      throw Error("Invalid inventory item.");
  for (const l of o.lots)
    if (
      !ref(o.items, l.itemId) ||
      !text(l.location) ||
      !["purchased", "produced"].includes(l.origin) ||
      !nonneg(l.quantity) ||
      !money(l.valueCents) ||
      !num(l.receivedAt) ||
      !str(l.sourceId) ||
      (l.expiresAt !== undefined && !num(l.expiresAt)) ||
      (l.dryMatterPercent !== undefined &&
        (!nonneg(l.dryMatterPercent) || l.dryMatterPercent > 100))
    )
      throw Error("Invalid inventory lot.");
  for (const m of o.movements)
    if (
      !ref(o.items, m.itemId) ||
      !o.lots.some((l) => l.id === m.lotId && l.itemId === m.itemId) ||
      !num(m.quantity) ||
      !Number.isSafeInteger(m.valueCents) ||
      !num(m.at) ||
      !str(m.referenceId) ||
      !str(m.notes) ||
      ![
        "purchase",
        "harvest",
        "feed",
        "application",
        "transfer-out",
        "transfer-in",
        "sale",
        "loss",
        "adjustment",
      ].includes(m.kind)
    )
      throw Error("Invalid inventory movement.");
  for (const l of o.lots) {
    const rows = o.movements.filter((m) => m.lotId === l.id);
    if (
      !new Decimal(
        rows.reduce((n, m) => n.plus(m.quantity), new Decimal(0)),
      ).eq(l.quantity) ||
      rows.reduce((n, m) => n + m.valueCents, 0) !== l.valueCents
    )
      throw Error("Inventory lot does not reconcile to movement history.");
  }
  for (const s of o.seasons)
    if (
      !ref(d.fields, s.fieldId) ||
      !o.enterprises.some(
        (e) => e.id === s.enterpriseId && e.kind === "crop",
      ) ||
      !Number.isInteger(s.year) ||
      !text(s.crop) ||
      !str(s.variety) ||
      !str(s.endUse) ||
      !nonneg(s.acres) ||
      !str(s.plantedOn) ||
      !str(s.expectedHarvest) ||
      !str(s.seedingRate) ||
      !str(s.establishedOn) ||
      !str(s.fertilityPlan) ||
      !str(s.notes) ||
      !nonneg(s.targetYield) ||
      !units.includes(s.unit)
    )
      throw Error("Invalid crop season.");
  for (const w of o.work)
    if (
      !o.seasons.some((s) => s.id === w.seasonId && s.fieldId === w.fieldId) ||
      !text(w.kind) ||
      !num(w.at) ||
      !ref(f.workers, w.workerId, true) ||
      !ref(o.assets, w.assetId, true) ||
      !nonneg(w.acres) ||
      !nonneg(w.minutes) ||
      !nonneg(w.hours) ||
      !nonneg(w.fuel) ||
      !ref(o.items, w.inputItemId, true) ||
      !nonneg(w.inputQuantity) ||
      !str(w.applicationRate) ||
      !money(w.costCents) ||
      !str(w.notes) ||
      (w.kind === "Spraying" &&
        (!w.chemical ||
          !text(w.chemical.product) ||
          !text(w.chemical.registration) ||
          !text(w.chemical.applicator) ||
          !str(w.chemical.certification) ||
          !str(w.chemical.conditions) ||
          !text(w.chemical.requirements)))
    )
      throw Error("Invalid fieldwork or chemical application record.");
  for (const h of o.harvests)
    if (
      !ref(o.seasons, h.seasonId) ||
      !num(h.at) ||
      !nonneg(h.quantity) ||
      h.quantity === 0 ||
      !units.includes(h.unit) ||
      (h.moisturePercent !== undefined &&
        (!nonneg(h.moisturePercent) || h.moisturePercent > 100)) ||
      !str(h.grade) ||
      !Number.isInteger(h.cutting) ||
      h.cutting < 1 ||
      !ref(o.lots, h.lotId) ||
      !money(h.costCents) ||
      !str(h.notes)
    )
      throw Error("Invalid harvest load.");
  for (const g of o.groups)
    if (
      !text(g.name) ||
      !o.enterprises.some(
        (e) => e.id === g.enterpriseId && e.kind === "cattle",
      ) ||
      !str(g.class) ||
      !Number.isInteger(g.headCount) ||
      g.headCount < 0 ||
      !str(g.location) ||
      !["individual", "headcount"].includes(g.mode) ||
      !str(g.notes)
    )
      throw Error("Invalid cattle group.");
  for (const a of o.animals)
    if (
      !text(a.tag) ||
      !str(a.eid) ||
      !ref(o.groups, a.groupId) ||
      !str(a.breed) ||
      !str(a.sex) ||
      !str(a.bornOn) ||
      !nonneg(a.birthWeight) ||
      !ref(o.animals, a.sireId, true) ||
      !ref(o.animals, a.damId, true) ||
      a.id === a.sireId ||
      a.id === a.damId ||
      !num(a.acquiredAt) ||
      !money(a.acquisitionCents) ||
      !["active", "sold", "dead", "culled"].includes(a.status) ||
      !str(a.notes)
    )
      throw Error("Invalid animal.");
  const activeTags = o.animals
    .filter((a) => a.status === "active")
    .map((a) => a.tag);
  if (new Set(activeTags).size !== activeTags.length)
    throw Error("Duplicate active ear tag.");
  for (const w of o.weights)
    if (
      !ref(o.animals, w.animalId) ||
      !num(w.at) ||
      !nonneg(w.weightLb) ||
      w.weightLb === 0
    )
      throw Error("Invalid cattle weight.");
  for (const h of o.health)
    if (
      !!h.animalId === !!h.groupId ||
      !ref(o.animals, h.animalId, true) ||
      !ref(o.groups, h.groupId, true) ||
      !num(h.at) ||
      !str(h.kind) ||
      !text(h.product) ||
      !text(h.dosage) ||
      !ref(f.workers, h.workerId, true) ||
      !str(h.veterinarian) ||
      !num(h.withdrawalUntil) ||
      h.withdrawalUntil < h.at ||
      !money(h.costCents) ||
      !str(h.notes)
    )
      throw Error("Invalid treatment/withdrawal record.");
  for (const r of o.reproduction)
    if (
      !ref(o.animals, r.animalId) ||
      !["exposure", "AI", "pregnancy-check", "calving", "weaning"].includes(
        r.kind,
      ) ||
      !num(r.at) ||
      !ref(o.animals, r.sireId, true) ||
      !ref(o.animals, r.calfId, true) ||
      !str(r.expectedOn) ||
      !str(r.result) ||
      !nonneg(r.weightLb) ||
      !str(r.difficulty) ||
      !str(r.notes)
    )
      throw Error("Invalid reproduction event.");
  for (const m of o.cattleMoves)
    if (
      !ref(o.animals, m.animalId) ||
      !ref(o.groups, m.fromGroupId) ||
      !ref(o.groups, m.toGroupId) ||
      !num(m.at) ||
      !str(m.notes)
    )
      throw Error("Invalid cattle movement.");
  for (const r of o.feeds)
    if (
      !ref(o.groups, r.groupId) ||
      !ref(o.items, r.itemId) ||
      !num(r.at) ||
      !nonneg(r.quantity) ||
      r.quantity === 0 ||
      !money(r.costCents) ||
      !units.includes(r.unit) ||
      !Number.isInteger(r.headCount) ||
      r.headCount < 1 ||
      !str(r.notes) ||
      (r.dryMatterQuantity !== undefined &&
        (!nonneg(r.dryMatterQuantity) || r.dryMatterQuantity > r.quantity))
    )
      throw Error("Invalid feed delivery.");
  for (const m of o.maintenance)
    if (
      !ref(o.assets, m.assetId) ||
      !text(m.title) ||
      !num(m.dueAt) ||
      !nonneg(m.dueHours) ||
      !nonneg(m.dueMiles) ||
      !["open", "completed"].includes(m.status) ||
      !str(m.symptoms) ||
      !str(m.diagnosis) ||
      !ref(f.workers, m.workerId, true) ||
      !nonneg(m.minutes) ||
      !money(m.costCents) ||
      !nonneg(m.downtimeMinutes) ||
      !ref(f.tasks, m.workOrderId, true) ||
      !nonneg(m.intervalDays) ||
      !nonneg(m.intervalHours) ||
      !nonneg(m.intervalMiles) ||
      !str(m.notes) ||
      (m.status === "completed" && !num(m.completedAt))
    )
      throw Error("Invalid maintenance record.");
  for (const m of o.meters)
    if (
      !ref(o.assets, m.assetId) ||
      !num(m.at) ||
      !nonneg(m.hours) ||
      !nonneg(m.miles) ||
      !str(m.notes)
    )
      throw Error("Invalid meter reading.");
  for (const j of o.journals) {
    if (
      !num(j.at) ||
      !text(j.description) ||
      !str(j.kind) ||
      !str(j.category) ||
      !str(j.contact) ||
      !str(j.referenceId) ||
      !Array.isArray(j.postings) ||
      !j.postings.length ||
      j.postings.reduce((n, p) => n + p.cents, 0) !== 0
    )
      throw Error("Unbalanced financial journal.");
    for (const p of j.postings)
      if (
        ![
          "cash",
          "inventory",
          "cropWip",
          "cattleWip",
          "expense",
          "revenue",
          "equity",
        ].includes(p.account) ||
        !Number.isSafeInteger(p.cents) ||
        !ref(o.enterprises, p.enterpriseId, true) ||
        !ref(d.fields, p.fieldId, true) ||
        !ref(o.groups, p.groupId, true) ||
        !ref(o.assets, p.assetId, true) ||
        !ref(o.animals, p.animalId, true)
      )
        throw Error("Invalid financial reference.");
  }
  if (
    accountBalance(f, "inventory") !==
    o.lots.reduce((n, l) => n + l.valueCents, 0)
  )
    throw Error("Inventory value does not reconcile to financial ledger.");
  for (const s of o.sales)
    if (
      !ref(o.animals, s.animalId, true) ||
      !ref(o.items, s.itemId, true) ||
      [s.animalId, s.itemId, s.groupId].filter(Boolean).length !== 1 ||
      (s.groupId !== undefined && !ref(o.groups, s.groupId, true)) ||
      !ref(o.enterprises, s.enterpriseId) ||
      !num(s.at) ||
      !nonneg(s.quantity) ||
      s.quantity === 0 ||
      !units.includes(s.unit) ||
      !money(s.grossCents) ||
      !money(s.feesCents) ||
      s.feesCents > s.grossCents ||
      !money(s.costCents) ||
      !str(s.buyer) ||
      !nonneg(s.weightLb) ||
      !str(s.notes) ||
      typeof s.withdrawalOverride !== "boolean"
    )
      throw Error("Invalid sale.");
  for (const b of o.boundaries) {
    if (
      !ref(d.fields, b.fieldId) ||
      !text(b.name) ||
      !["manual", "geojson"].includes(b.source) ||
      !Array.isArray(b.coordinates) ||
      b.coordinates.length < 4 ||
      b.coordinates.length > 5000
    )
      throw Error("Invalid field boundary.");
    validateRing(b.coordinates);
    for (const p of b.coordinates)
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        !num(p[0]) ||
        !num(p[1]) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90
      )
        throw Error("Invalid longitude/latitude.");
    if (
      JSON.stringify(b.coordinates[0]) !== JSON.stringify(b.coordinates.at(-1))
    )
      throw Error("Polygon ring must be closed.");
  }
  for (const r of o.observations)
    if (
      !ref(d.fields, r.fieldId, true) ||
      !num(r.at) ||
      !text(r.kind) ||
      !str(r.value) ||
      !str(r.notes)
    )
      throw Error("Invalid field observation.");
  for (const r of o.documents)
    if (
      !text(r.name) ||
      !["text/plain", "application/pdf", "image/png", "image/jpeg"].includes(
        r.mime,
      ) ||
      !str(r.data) ||
      !r.data.startsWith("data:" + r.mime + ";base64,") ||
      r.data.length > 2800000 ||
      !/^data:(text\/plain|application\/pdf|image\/(png|jpeg));base64,[A-Za-z0-9+/=]+$/.test(
        r.data,
      ) ||
      !ref(d.fields, r.fieldId, true) ||
      !ref(o.assets, r.assetId, true) ||
      !str(r.notes)
    )
      throw Error("Invalid attachment (limit 2 MB; no executable content).");
  for (const s of o.scenarios)
    if (
      !ref(o.enterprises, s.enterpriseId) ||
      !text(s.name) ||
      !nonneg(s.quantity) ||
      !money(s.priceCents) ||
      !num(s.costChangePercent) ||
      s.costChangePercent < -100 ||
      !num(s.yieldChangePercent) ||
      s.yieldChangePercent < -100
    )
      throw Error("Invalid scenario.");
  for (const b of o.beefOrders)
    if (
      !ref(o.animals, b.animalId) ||
      !text(b.customer) ||
      ![0.25, 0.5, 1].includes(b.fraction) ||
      !str(b.appointment) ||
      !nonneg(b.hangingLb) ||
      !nonneg(b.takeHomeLb) ||
      !money(b.priceCents) ||
      !money(b.depositCents) ||
      !money(b.processingCents) ||
      typeof b.customerPaysProcessor !== "boolean" ||
      !str(b.notes)
    )
      throw Error("Invalid beef reservation.");
}
