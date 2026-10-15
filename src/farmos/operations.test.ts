import { parseCattleCsv, importCattle } from "./cattle-import";
import { parseBoundary } from "./geometry";
import { it, expect } from "vitest";
import { demo } from "../demo";
import { validate } from "../model";
import { upgrade, requireFarm, base } from "./domain";
import {
  ops,
  purchase,
  stockSummary,
  addExpense,
  harvest,
  feed,
  acquireAnimal,
  sell,
  accountBalance,
  enterpriseReport,
  transferLot,
  allocateCost,
  maintenanceDue,
  service,
  adg,
  cents,
  treatment,
  meter,
  correctMeter,
  moveAnimal,
  scenarioResult,
  bulkFieldwork,
  recordFieldwork,
  reverseExpense,
  feedRation,
  type Animal,
  type Season,
} from "./operations";
function fixture() {
  let d = upgrade(demo());
  const f = requireFarm(d),
    o = ops(f);
  const crop = {
      ...base(f),
      name: "Silage",
      kind: "crop" as const,
      year: 2026,
      budgetCents: 1000000,
    },
    cattle = {
      ...base(f),
      name: "Finishing",
      kind: "cattle" as const,
      year: 2026,
      budgetCents: 500000,
    };
  o.enterprises.push(crop, cattle);
  const item = {
    ...base(f),
    name: "Corn silage",
    category: "Feed",
    unit: "ton" as const,
    lowStock: 10,
  };
  o.items.push(item);
  const season: Season = {
    ...base(f),
    fieldId: d.fields[0].id,
    enterpriseId: crop.id,
    year: 2026,
    crop: "Corn silage",
    variety: "Fictional",
    endUse: "Feed",
    acres: 20,
    plantedOn: "2026-05-01",
    expectedHarvest: "2026-09-30",
    seedingRate: "",
    targetYield: 200,
    unit: "ton",
    establishedOn: "",
    fertilityPlan: "",
    notes: "",
  };
  o.seasons.push(season);
  const group = {
    ...base(f),
    name: "Steers",
    enterpriseId: cattle.id,
    class: "finishing",
    headCount: 2,
    location: "North pen",
    mode: "individual" as const,
    notes: "",
  };
  o.groups.push(group);
  return { d, crop, cattle, item, season, group };
}
it("crop harvest to feed reconciles cost with no fictitious revenue or duplicate expense", () => {
  let { d, crop, cattle, item, season, group } = fixture();
  d = addExpense(d, {
    enterpriseId: crop.id,
    fieldId: season.fieldId,
    assetId: "",
    amountCents: 1000000,
    description: "Production cost",
    category: "crop",
    contact: "",
    at: Date.now(),
  });
  d = harvest(d, {
    seasonId: season.id,
    at: Date.now(),
    quantity: 200,
    unit: "ton",
    moisturePercent: 65,
    grade: "",
    cutting: 1,
    costCents: 1000000,
    notes: "",
    itemId: item.id,
    location: "Pit",
  });
  const a: Omit<Animal, keyof ReturnType<typeof base>> = {
    tag: "Fictional 1",
    eid: "",
    groupId: group.id,
    breed: "Angus",
    sex: "steer",
    bornOn: "",
    birthWeight: 70,
    sireId: "",
    damId: "",
    acquiredAt: Date.now(),
    acquisitionCents: 100000,
    status: "active",
    notes: "",
  };
  d = acquireAnimal(d, a);
  d = feed(
    d,
    {
      groupId: group.id,
      itemId: item.id,
      quantity: 10,
      at: Date.now(),
      notes: "",
    },
    "feed-once",
  );
  const copy = feed(
    d,
    {
      groupId: group.id,
      itemId: item.id,
      quantity: 10,
      at: Date.now(),
      notes: "",
    },
    "feed-once",
  );
  expect(copy).toEqual(d);
  const f = requireFarm(d);
  expect(ops(f).lots[0].quantity).toBe(190);
  expect(ops(f).lots[0].valueCents).toBe(950000);
  expect(ops(f).feeds[0].dryMatterQuantity).toBe(3.5);
  expect(accountBalance(f, "inventory")).toBe(950000);
  expect(accountBalance(f, "cropWip")).toBe(0);
  expect(accountBalance(f, "cattleWip")).toBe(150000);
  expect(accountBalance(f, "revenue")).toBe(0);
  expect(enterpriseReport(f, crop.id).productionCents).toBe(1000000);
  validate(d);
});
it("failed feed and excessive harvest cost leave original inventory unchanged", () => {
  const { d, item, group, season } = fixture();
  const before = structuredClone(d);
  expect(() =>
    feed(d, {
      groupId: group.id,
      itemId: item.id,
      quantity: 10,
      at: Date.now(),
      notes: "",
    }),
  ).toThrow();
  expect(() =>
    harvest(d, {
      seasonId: season.id,
      at: Date.now(),
      quantity: 200,
      unit: "ton",
      moisturePercent: 65,
      grade: "",
      cutting: 1,
      costCents: 1,
      notes: "",
      itemId: item.id,
      location: "Pit",
    }),
  ).toThrow(/exceeds/);
  expect(d).toEqual(before);
});
it("FIFO purchase, partial cost rounding, location transfer and sale reconcile cents", () => {
  let { d, item, crop } = fixture();
  d = purchase(d, {
    itemId: item.id,
    quantity: 3,
    costCents: 100,
    location: "A",
    at: Date.now(),
  });
  const lot = ops(requireFarm(d)).lots[0];
  d = transferLot(d, lot.id, 1, "B", "Move");
  expect(accountBalance(requireFarm(d), "inventory")).toBe(100);
  d = sell(d, {
    animalId: "",
    itemId: item.id,
    enterpriseId: crop.id,
    at: Date.now(),
    quantity: 3,
    unit: "ton",
    grossCents: 500,
    feesCents: 50,
    buyer: "Fictional buyer",
    weightLb: 0,
    notes: "",
    withdrawalOverride: false,
  });
  expect(ops(requireFarm(d)).lots.reduce((n, l) => n + l.valueCents, 0)).toBe(
    0,
  );
  expect(enterpriseReport(requireFarm(d), crop.id).operatingMarginCents).toBe(
    350,
  );
  validate(d);
});
it("allocates one repair expense without duplicating farm-wide costs", () => {
  let { d, crop } = fixture();
  d = addExpense(d, {
    enterpriseId: "",
    fieldId: "",
    assetId: "",
    amountCents: 10000,
    description: "Repair",
    category: "equipment",
    contact: "",
    at: Date.now(),
  });
  const j = ops(requireFarm(d)).journals[0];
  d = allocateCost(
    d,
    j.id,
    [
      {
        enterpriseId: crop.id,
        fieldId: d.fields[0].id,
        groupId: "",
        animalId: "",
        cents: 10000,
      },
    ],
    "recorded hours",
  );
  expect(accountBalance(requireFarm(d), "cash")).toBe(-10000);
  expect(accountBalance(requireFarm(d), "expense")).toBe(0);
  expect(accountBalance(requireFarm(d), "cropWip")).toBe(10000);
  expect(() => allocateCost(d, j.id, [], "again")).toThrow();
  validate(d);
});
it("rejects corrupt inventory and financial backups", () => {
  let { d, item } = fixture();
  d = purchase(d, {
    itemId: item.id,
    quantity: 1,
    costCents: 100,
    location: "A",
    at: Date.now(),
  });
  const f = requireFarm(d);
  ops(f).lots[0].quantity = 2;
  expect(() => validate(d)).toThrow(/reconcile/);
});
it("handles cents without floating point drift", () => {
  expect(cents("0.29")).toBe(29);
  expect(() => cents("0.001")).toThrow();
});

function animalInput(
  groupId: string,
  tag = "Fictional steer",
): Omit<Animal, keyof ReturnType<typeof base>> {
  return {
    tag,
    eid: "",
    groupId,
    breed: "Angus",
    sex: "steer",
    bornOn: "2025-03-01",
    birthWeight: 70,
    sireId: "",
    damId: "",
    acquiredAt: Date.now(),
    acquisitionCents: 100000,
    status: "active",
    notes: "",
  };
}
it("finishing sale includes individual and proportional group feed cost and requires withdrawal acknowledgment", () => {
  let { d, cattle, item, group } = fixture();
  d = acquireAnimal(d, animalInput(group.id, "A"));
  d = acquireAnimal(d, animalInput(group.id, "B"));
  d = purchase(d, {
    itemId: item.id,
    quantity: 10,
    costCents: 10000,
    location: "Pit",
    at: Date.now(),
  });
  d = feed(d, {
    groupId: group.id,
    itemId: item.id,
    quantity: 2,
    at: Date.now(),
    notes: "",
  });
  const a = ops(requireFarm(d)).animals[0];
  d = treatment(d, {
    animalId: a.id,
    groupId: "",
    at: Date.now(),
    kind: "Treatment",
    product: "Fictional medicine",
    dosage: "Example only",
    workerId: "",
    veterinarian: "Fictional vet",
    withdrawalUntil: Date.now() + 86400000,
    costCents: 1000,
    notes: "",
  });
  const sale = {
    animalId: a.id,
    itemId: "",
    enterpriseId: cattle.id,
    at: Date.now(),
    quantity: 1,
    unit: "count" as const,
    grossCents: 200000,
    feesCents: 0,
    buyer: "Fictional buyer",
    weightLb: 1300,
    notes: "",
    withdrawalOverride: false,
  };
  expect(() => sell(d, sale)).toThrow(/Withdrawal/);
  d = sell(d, { ...sale, withdrawalOverride: true });
  expect(ops(requireFarm(d)).sales[0].costCents).toBe(102000);
  expect(enterpriseReport(requireFarm(d), cattle.id).operatingMarginCents).toBe(
    98000,
  );
  expect(accountBalance(requireFarm(d), "cattleWip")).toBe(101000);
  validate(d);
});
it("meter-based service records one expense and schedules another interval atomically", () => {
  let { d } = fixture();
  const f = requireFarm(d),
    o = ops(f);
  const asset = {
    ...base(f),
    name: "Tractor",
    category: "Tractor",
    make: "",
    model: "",
    year: 2026,
    serial: "",
    location: "",
    purchaseCents: 0,
    hours: 499,
    miles: 0,
    status: "available" as const,
    notes: "",
  };
  o.assets.push(asset);
  const maintenance = {
    ...base(f),
    assetId: asset.id,
    title: "Oil change",
    dueAt: 0,
    dueHours: 500,
    dueMiles: 0,
    status: "open" as const,
    symptoms: "",
    diagnosis: "",
    workerId: "",
    minutes: 0,
    costCents: 0,
    downtimeMinutes: 0,
    workOrderId: "",
    intervalDays: 0,
    intervalHours: 100,
    intervalMiles: 0,
    notes: "",
  };
  o.maintenance.push(maintenance);
  expect(maintenanceDue(maintenance, asset)).toBe(false);
  expect(() => meter(d, asset.id, 1, 0, "")).toThrow(/decrease/);
  d = meter(d, asset.id, 500, 0, "Actual reading");
  expect(
    maintenanceDue(
      ops(requireFarm(d)).maintenance[0],
      ops(requireFarm(d)).assets[0],
    ),
  ).toBe(true);
  d = service(
    d,
    maintenance.id,
    20,
    5000,
    "Changed oil",
    "Fictional service",
    "service-once",
  );
  const duplicate = service(
    d,
    maintenance.id,
    20,
    5000,
    "Changed oil",
    "",
    "service-once",
  );
  expect(duplicate).toEqual(d);
  expect(ops(requireFarm(d)).maintenance[1].dueHours).toBe(600);
  expect(accountBalance(requireFarm(d), "cash")).toBe(-5000);
  validate(d);
});
it("bulk fieldwork distributes cost and machinery hours without duplicating totals", () => {
  let { d, season } = fixture();
  const f = requireFarm(d),
    o = ops(f);
  o.seasons.push({ ...season, ...base(f), fieldId: d.fields[1].id, acres: 20 });
  const work = {
    kind: "Planting",
    at: Date.now(),
    workerId: "",
    assetId: "",
    acres: 40,
    minutes: 120,
    hours: 2,
    fuel: 10,
    inputItemId: "",
    inputQuantity: 0,
    applicationRate: "",
    costCents: 10001,
    notes: "",
  };
  d = bulkFieldwork(
    d,
    o.seasons.map((s) => s.id),
    work,
  );
  expect(ops(requireFarm(d)).work.reduce((n, w) => n + w.costCents, 0)).toBe(
    10001,
  );
  expect(ops(requireFarm(d)).work.reduce((n, w) => n + w.minutes, 0)).toBe(120);
  expect(accountBalance(requireFarm(d), "cash")).toBe(-10001);
  validate(d);
});
it("expense reversal corrects production totals, retains history and is not repeatable", () => {
  let { d, crop, season } = fixture();
  d = addExpense(d, {
    enterpriseId: crop.id,
    fieldId: season.fieldId,
    assetId: "",
    amountCents: 12345,
    description: "Incorrect expense",
    category: "Seed",
    contact: "",
    at: Date.now(),
  });
  const id = ops(requireFarm(d)).journals[0].id;
  d = reverseExpense(d, id, "Correcting entry");
  expect(accountBalance(requireFarm(d), "cash")).toBe(0);
  expect(enterpriseReport(requireFarm(d), crop.id).productionCents).toBe(0);
  expect(ops(requireFarm(d)).journals).toHaveLength(2);
  expect(() => reverseExpense(d, id, "Again")).toThrow();
  validate(d);
});
it("CSV staging handles quoted tags and rejects corruption before atomic import", () => {
  const { d, group } = fixture();
  const rows = parseCattleCsv(
    'tag,breed,acquisitionCostUSD\n"Fictional, 001",Angus,1000.25',
    group.id,
  );
  expect(rows[0].tag).toBe("Fictional, 001");
  const result = importCattle(d, rows);
  expect(ops(requireFarm(result)).animals).toHaveLength(1);
  expect(ops(requireFarm(d)).animals).toHaveLength(0);
  expect(() => importCattle(result, rows)).toThrow(/tag/);
  expect(() => parseCattleCsv("tag,tag\na,b", group.id)).toThrow();
  expect(() => parseCattleCsv("tag\na\na", group.id)).toThrow(/duplicate/);
  validate(result);
});
it("saved ration consumption is atomic and retry-safe across ingredients", () => {
  let { d, item, group } = fixture();
  ops(requireFarm(d)).groups[0].mode = "headcount";
  d = purchase(d, {
    itemId: item.id,
    quantity: 20,
    costCents: 10000,
    location: "Pit",
    at: Date.now(),
    dryMatterPercent: 35,
  });
  const f = requireFarm(d),
    r = {
      ...base(f),
      name: "Fictional recipe",
      ingredients: [{ itemId: item.id, quantity: 2 }],
      notes: "",
    };
  ops(f).rations.push(r);
  d = feedRation(d, r.id, group.id, 2, Date.now(), "", "ration-once");
  expect(ops(requireFarm(d)).lots[0].quantity).toBe(16);
  expect(
    feedRation(d, r.id, group.id, 2, Date.now(), "", "ration-once"),
  ).toEqual(d);
  expect(() => feedRation(d, r.id, group.id, 100, Date.now(), "")).toThrow(
    /Insufficient/,
  );
  expect(ops(requireFarm(d)).lots[0].quantity).toBe(16);
  validate(d);
});
it("scenario calculations leave actual ledger unchanged and explain zero production", () => {
  const { d, crop } = fixture();
  const f = requireFarm(d),
    s = {
      ...base(f),
      enterpriseId: crop.id,
      name: "What if",
      quantity: 0,
      priceCents: 500,
      costChangePercent: 15,
      yieldChangePercent: -10,
    };
  const before = JSON.stringify(d);
  expect(scenarioResult(f, s).breakevenPriceCents).toBeNull();
  expect(JSON.stringify(d)).toBe(before);
});
it("rejects crossing/invalid map boundaries and accepts a local GeoJSON polygon", () => {
  expect(() => parseBoundary("[[0,0],[1,1],[0,1],[1,0],[0,0]]")).toThrow();
  expect(() => parseBoundary("[[0,0],[1,0],[1,1],[0,1]]")).toThrow(/Close/);
  expect(
    parseBoundary(
      '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
    ),
  ).toHaveLength(4);
});

it("animal carrying costs follow a move to a different enterprise without creating revenue", () => {
  let { d, cattle, group } = fixture();
  d = acquireAnimal(d, animalInput(group.id, "Transfer steer"));
  const f = requireFarm(d),
    o = ops(f);
  const enterprise = {
    ...base(f),
    name: "Fictional new enterprise",
    kind: "cattle" as const,
    year: 2026,
    budgetCents: 0,
  };
  o.enterprises.push(enterprise);
  const destination = {
    ...group,
    ...base(f),
    name: "Fictional new group",
    enterpriseId: enterprise.id,
  };
  o.groups.push(destination);
  const animal = o.animals[0];
  d = moveAnimal(d, animal.id, destination.id, "Transfer to finishing");
  expect(accountBalance(requireFarm(d), "cattleWip", cattle.id)).toBe(0);
  expect(accountBalance(requireFarm(d), "cattleWip", enterprise.id)).toBe(
    100000,
  );
  expect(accountBalance(requireFarm(d), "revenue")).toBe(0);
  expect(ops(requireFarm(d)).cattleMoves).toHaveLength(1);
  validate(d);
});
it("headcount group sales consume proportional group cost and preserve remaining cost", () => {
  let { d, cattle, group } = fixture();
  ops(requireFarm(d)).groups[0].mode = "headcount";
  ops(requireFarm(d)).groups[0].headCount = 40;
  d = addExpense(d, {
    enterpriseId: cattle.id,
    fieldId: "",
    assetId: "",
    groupId: group.id,
    amountCents: 4000000,
    description: "Fictional group acquisition",
    category: "Animals",
    contact: "Fictional seller",
    at: Date.now(),
  });
  d = sell(d, {
    groupId: group.id,
    animalId: "",
    itemId: "",
    enterpriseId: cattle.id,
    at: Date.now(),
    quantity: 10,
    unit: "count",
    grossCents: 1500000,
    feesCents: 50000,
    buyer: "Fictional buyer",
    weightLb: 0,
    notes: "",
    withdrawalOverride: false,
  });
  expect(ops(requireFarm(d)).groups[0].headCount).toBe(30);
  expect(ops(requireFarm(d)).sales[0].costCents).toBe(1000000);
  expect(accountBalance(requireFarm(d), "cattleWip")).toBe(3000000);
  expect(enterpriseReport(requireFarm(d), cattle.id).operatingMarginCents).toBe(
    450000,
  );
  validate(d);
});
it("meter corrections require confirmation and keep a historical reason", () => {
  const { d } = fixture();
  const f = requireFarm(d);
  const asset = {
    ...base(f),
    name: "Corrected tractor",
    category: "Tractor",
    make: "",
    model: "",
    year: 2026,
    serial: "",
    location: "",
    purchaseCents: 0,
    hours: 500,
    miles: 0,
    status: "available" as const,
    notes: "",
  };
  ops(f).assets.push(asset);
  expect(() => correctMeter(d, asset.id, 450, 0, "Incorrect reading")).toThrow(
    /confirmation/,
  );
  const corrected = correctMeter(
    d,
    asset.id,
    450,
    0,
    "Incorrect reading",
    true,
  );
  expect(ops(requireFarm(corrected)).assets[0].hours).toBe(450);
  expect(ops(requireFarm(corrected)).meters[0].notes).toContain("500h");
  expect(ops(requireFarm(d)).assets[0].hours).toBe(500);
  validate(corrected);
});

it("average daily gain uses actual dated measurements and explains missing observations", () => {
  let { d, group } = fixture();
  d = acquireAnimal(d, animalInput(group.id, "Weighed steer"));
  const f = requireFarm(d),
    o = ops(f),
    id = o.animals[0].id;
  expect(adg(f, id)).toBeNull();
  o.weights.push(
    { ...base(f), animalId: id, at: Date.UTC(2026, 8, 1), weightLb: 1000 },
    { ...base(f), animalId: id, at: Date.UTC(2026, 9, 1), weightLb: 1100 },
  );
  expect(adg(f, id)).toBe(3.333);
  validate(d);
});

it("unknown harvest moisture remains unknown rather than assuming completely dry feed", () => {
  const { d, item, season } = fixture();
  const result = harvest(d, {
    seasonId: season.id,
    at: Date.now(),
    quantity: 10,
    unit: "ton",
    grade: "",
    cutting: 1,
    costCents: 0,
    notes: "Moisture not measured",
    itemId: item.id,
    location: "Pit",
  });
  expect(ops(requireFarm(result)).lots[0].dryMatterPercent).toBeUndefined();
  expect(ops(requireFarm(result)).harvests[0].moisturePercent).toBeUndefined();
  validate(result);
});

it("fractional inventory purchases trigger low-stock warnings at the exact threshold", () => {
  let { d, item } = fixture();
  ops(requireFarm(d)).items[0].lowStock = 0.3;
  d = purchase(d, {
    itemId: item.id,
    quantity: 0.1,
    costCents: 1,
    location: "A",
    at: Date.now(),
  });
  d = purchase(d, {
    itemId: item.id,
    quantity: 0.2,
    costCents: 2,
    location: "A",
    at: Date.now(),
  });
  expect(stockSummary(requireFarm(d), item.id)).toEqual({
    quantity: 0.3,
    valueCents: 3,
    low: true,
  });
  validate(d);
});
