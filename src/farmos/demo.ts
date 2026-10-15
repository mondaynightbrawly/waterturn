import { demo } from "../demo";
import { upgrade, requireFarm, base } from "./domain";
import {
  ops,
  addExpense,
  harvest,
  feed,
  acquireAnimal,
  treatment,
  meter,
} from "./operations";
/** Optional fictional records only. No accounts, real coordinates or agronomic recommendations. */
export function farmDemo() {
  let d = upgrade(demo());
  const f = requireFarm(d),
    o = ops(f),
    now = Date.now();
  f.organization.name = "Willow Creek · Fictional FarmOS Demo";
  d.settings.farmName = f.organization.name;
  const property = {
    ...base(f),
    name: "Fictional Willow Creek Ranch",
    acreage: 95,
    notes: "Demonstration only. No actual farm information.",
  };
  f.properties.push(property);
  for (const field of d.fields) f.fieldProperties[field.id] = property.id;
  const worker = {
    ...base(f),
    name: "Demo operator",
    kind: "employee" as const,
  };
  f.workers.push(worker);
  const crop = {
      ...base(f),
      name: "Fictional corn silage",
      kind: "crop" as const,
      year: new Date(now).getFullYear(),
      budgetCents: 1200000,
    },
    cattle = {
      ...base(f),
      name: "Fictional cattle finishing",
      kind: "cattle" as const,
      year: new Date(now).getFullYear(),
      budgetCents: 3000000,
    };
  o.enterprises.push(crop, cattle);
  const silage = {
    ...base(f),
    name: "Fictional corn silage stock",
    category: "Feed",
    unit: "ton" as const,
    lowStock: 50,
  };
  o.items.push(silage, {
    ...base(f),
    name: "Fictional mineral supply",
    category: "Feed",
    unit: "lb",
    lowStock: 50,
  });
  const season = {
    ...base(f),
    fieldId: d.fields[0].id,
    enterpriseId: crop.id,
    year: crop.year,
    crop: "Corn silage",
    variety: "Demo hybrid",
    endUse: "Feed",
    acres: 40,
    plantedOn: "2026-05-01",
    expectedHarvest: "2026-10-20",
    seedingRate: "Fictional rate not specified",
    targetYield: 200,
    unit: "ton" as const,
    establishedOn: "",
    fertilityPlan: "Fictional plan; not agronomic advice.",
    notes: "Demonstration crop season",
  };
  o.seasons.push(season);
  const group = {
    ...base(f),
    name: "Fictional finishing group",
    enterpriseId: cattle.id,
    class: "Finishing",
    headCount: 40,
    location: "Fictional north pen",
    mode: "headcount" as const,
    notes: "Fictional inventory transfer example; not a feed recommendation.",
  };
  o.groups.push(group);
  const individuals = {
    ...base(f),
    name: "Fictional individual cattle",
    enterpriseId: cattle.id,
    class: "Backgrounding",
    headCount: 0,
    location: "Fictional south pen",
    mode: "individual" as const,
    notes: "",
  };
  o.groups.push(individuals);
  const asset = {
    ...base(f),
    name: "Fictional Tractor 03",
    category: "Tractor",
    make: "Demo",
    model: "Field tractor",
    year: 2020,
    serial: "FICTIONAL-003",
    location: "Fictional shop",
    purchaseCents: 0,
    hours: 500,
    miles: 0,
    status: "available" as const,
    notes: "Demonstration equipment",
  };
  o.assets.push(asset);
  const job = {
    ...base(f),
    title: "Demo oil service · Tractor 03",
    description: "Fictional service task",
    status: "open" as const,
    priority: "normal" as const,
    dueAt: 0,
    workerId: worker.id,
    fieldId: "",
    assetId: asset.id,
    estimatedMinutes: 45,
    actualMinutes: 0,
    notes: "",
    repeatDays: 0,
  };
  f.tasks.push(job, {
    ...base(f),
    title: "Demo check east headgate",
    description: "Fictional field task",
    status: "open",
    priority: "high",
    dueAt: now + 3600000,
    workerId: worker.id,
    fieldId: d.fields[0].id,
    assetId: "",
    estimatedMinutes: 20,
    actualMinutes: 0,
    notes: "",
    repeatDays: 0,
  });
  o.maintenance.push({
    ...base(f),
    assetId: asset.id,
    title: job.title,
    dueAt: 0,
    dueHours: 500,
    dueMiles: 0,
    status: "open",
    symptoms: "Demonstration interval service",
    diagnosis: "",
    workerId: worker.id,
    minutes: 0,
    costCents: 0,
    downtimeMinutes: 0,
    workOrderId: job.id,
    intervalDays: 0,
    intervalHours: 100,
    intervalMiles: 0,
    notes: "",
  });
  d = addExpense(d, {
    enterpriseId: crop.id,
    fieldId: season.fieldId,
    assetId: "",
    amountCents: 1000000,
    description: "Fictional crop production costs",
    category: "Crop inputs",
    contact: "Fictional supplier",
    at: now - 86400000,
  });
  d = harvest(d, {
    seasonId: season.id,
    at: now - 7200000,
    quantity: 200,
    unit: "ton",
    moisturePercent: 65,
    grade: "Fictional",
    cutting: 1,
    costCents: 1000000,
    notes: "Example cost capitalization",
    itemId: silage.id,
    location: "Fictional silage pit",
  });
  d = feed(d, {
    groupId: group.id,
    itemId: silage.id,
    quantity: 1,
    at: now - 3600000,
    notes: "Example inventory transfer; not a ration recommendation.",
  });
  d = acquireAnimal(d, {
    tag: "DEMO-001",
    eid: "",
    groupId: individuals.id,
    breed: "Fictional Angus cross",
    sex: "steer",
    bornOn: "2025-03-01",
    birthWeight: 75,
    sireId: "",
    damId: "",
    acquiredAt: now - 40 * 86400000,
    acquisitionCents: 100000,
    status: "active",
    notes: "Fictional animal",
  });
  const latest = requireFarm(d),
    latestOps = ops(latest),
    animal = latestOps.animals[0];
  latestOps.weights.push(
    {
      ...base(latest),
      animalId: animal.id,
      at: now - 30 * 86400000,
      weightLb: 950,
    },
    { ...base(latest), animalId: animal.id, at: now, weightLb: 1050 },
  );
  d = treatment(d, {
    animalId: animal.id,
    groupId: "",
    at: now - 86400000,
    kind: "Treatment",
    product: "Fictional treatment example",
    dosage: "Example only; no medication instruction",
    workerId: worker.id,
    veterinarian: "Fictional veterinary record",
    withdrawalUntil: now + 7 * 86400000,
    costCents: 2500,
    notes: "Example restriction, not a veterinary recommendation.",
  });
  d = meter(d, asset.id, 500, 0, "Fictional current meter reading");
  return d;
}
