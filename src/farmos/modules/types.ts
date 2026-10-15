import { type Base } from "../domain";
export const units = [
  "ton",
  "lb",
  "kg",
  "bushel",
  "bale",
  "gallon",
  "liter",
  "count",
] as const;

export type Unit = (typeof units)[number];

export type Enterprise = Base & {
  name: string;
  kind: "crop" | "cattle" | "other";
  year: number;
  budgetCents: number;
};

export type Asset = Base & {
  name: string;
  category: string;
  make: string;
  model: string;
  year: number;
  serial: string;
  location: string;
  purchaseCents: number;
  hours: number;
  miles: number;
  status: "available" | "out-of-service" | "retired";
  notes: string;
};

export type Item = Base & {
  name: string;
  category: string;
  unit: Unit;
  lowStock: number;
};

export type Lot = Base & {
  itemId: string;
  location: string;
  origin: "purchased" | "produced";
  quantity: number;
  valueCents: number;
  receivedAt: number;
  expiresAt?: number;
  sourceId: string;
  dryMatterPercent?: number;
};

export type Movement = Base & {
  itemId: string;
  lotId: string;
  quantity: number;
  valueCents: number;
  kind:
    | "purchase"
    | "harvest"
    | "feed"
    | "application"
    | "transfer-out"
    | "transfer-in"
    | "sale"
    | "loss"
    | "adjustment";
  at: number;
  referenceId: string;
  notes: string;
};

export type Season = Base & {
  fieldId: string;
  enterpriseId: string;
  year: number;
  crop: string;
  variety: string;
  endUse: string;
  acres: number;
  plantedOn: string;
  expectedHarvest: string;
  seedingRate: string;
  targetYield: number;
  unit: Unit;
  establishedOn: string;
  fertilityPlan: string;
  notes: string;
};

export type Work = Base & {
  seasonId: string;
  fieldId: string;
  kind: string;
  at: number;
  workerId: string;
  assetId: string;
  acres: number;
  minutes: number;
  hours: number;
  fuel: number;
  inputItemId: string;
  inputQuantity: number;
  applicationRate: string;
  costCents: number;
  notes: string;
  chemical?: {
    product: string;
    registration: string;
    applicator: string;
    certification: string;
    conditions: string;
    requirements: string;
  };
};

export type Harvest = Base & {
  seasonId: string;
  at: number;
  quantity: number;
  unit: Unit;
  moisturePercent?: number;
  grade: string;
  cutting: number;
  lotId: string;
  costCents: number;
  notes: string;
};

export type Group = Base & {
  name: string;
  enterpriseId: string;
  class: string;
  headCount: number;
  location: string;
  mode: "individual" | "headcount";
  notes: string;
};

export type Animal = Base & {
  tag: string;
  eid: string;
  groupId: string;
  breed: string;
  sex: string;
  bornOn: string;
  birthWeight: number;
  sireId: string;
  damId: string;
  acquiredAt: number;
  acquisitionCents: number;
  status: "active" | "sold" | "dead" | "culled";
  notes: string;
};

export type Weight = Base & { animalId: string; at: number; weightLb: number };

export type Health = Base & {
  animalId: string;
  groupId: string;
  at: number;
  kind: string;
  product: string;
  dosage: string;
  workerId: string;
  veterinarian: string;
  withdrawalUntil: number;
  costCents: number;
  notes: string;
};

export type Reproduction = Base & {
  animalId: string;
  kind: "exposure" | "AI" | "pregnancy-check" | "calving" | "weaning";
  at: number;
  sireId: string;
  calfId: string;
  expectedOn: string;
  result: string;
  weightLb: number;
  difficulty: string;
  notes: string;
};

export type CattleMove = Base & {
  animalId: string;
  fromGroupId: string;
  toGroupId: string;
  at: number;
  notes: string;
};

export type Feed = Base & {
  groupId: string;
  itemId: string;
  at: number;
  quantity: number;
  unit: Unit;
  costCents: number;
  headCount: number;
  dryMatterQuantity?: number;
  notes: string;
};

export type Maintenance = Base & {
  assetId: string;
  title: string;
  dueAt: number;
  dueHours: number;
  dueMiles: number;
  status: "open" | "completed";
  symptoms: string;
  diagnosis: string;
  workerId: string;
  minutes: number;
  costCents: number;
  downtimeMinutes: number;
  completedAt?: number;
  workOrderId: string;
  intervalDays: number;
  intervalHours: number;
  intervalMiles: number;
  notes: string;
};

export type Meter = Base & {
  assetId: string;
  at: number;
  hours: number;
  miles: number;
  notes: string;
};

export type Account =
  | "cash"
  | "inventory"
  | "cropWip"
  | "cattleWip"
  | "expense"
  | "revenue"
  | "equity";

export type Posting = {
  account: Account;
  cents: number;
  enterpriseId: string;
  fieldId: string;
  groupId: string;
  assetId: string;
  animalId: string;
};

export type Journal = Base & {
  at: number;
  description: string;
  kind: string;
  category: string;
  contact: string;
  referenceId: string;
  postings: Posting[];
  reversalOf?: string;
};

export type Sale = Base & {
  groupId?: string;
  animalId: string;
  itemId: string;
  enterpriseId: string;
  at: number;
  quantity: number;
  unit: Unit;
  grossCents: number;
  feesCents: number;
  costCents: number;
  buyer: string;
  weightLb: number;
  notes: string;
  withdrawalOverride: boolean;
};

export type Boundary = Base & {
  fieldId: string;
  name: string;
  coordinates: number[][];
  source: "manual" | "geojson";
};

export type Observation = Base & {
  fieldId: string;
  at: number;
  kind: string;
  value: string;
  notes: string;
};

export type DocumentRecord = Base & {
  name: string;
  mime: string;
  data: string;
  fieldId: string;
  assetId: string;
  notes: string;
};

export type Scenario = Base & {
  enterpriseId: string;
  name: string;
  quantity: number;
  priceCents: number;
  costChangePercent: number;
  yieldChangePercent: number;
};

export type BeefOrder = Base & {
  animalId: string;
  customer: string;
  fraction: number;
  appointment: string;
  hangingLb: number;
  takeHomeLb: number;
  priceCents: number;
  depositCents: number;
  processingCents: number;
  customerPaysProcessor: boolean;
  notes: string;
};

export type Ration = Base & {
  name: string;
  ingredients: { itemId: string; quantity: number }[];
  notes: string;
};

export type Operations = {
  rations: Ration[];
  enterprises: Enterprise[];
  assets: Asset[];
  items: Item[];
  lots: Lot[];
  movements: Movement[];
  seasons: Season[];
  work: Work[];
  harvests: Harvest[];
  groups: Group[];
  animals: Animal[];
  weights: Weight[];
  health: Health[];
  reproduction: Reproduction[];
  cattleMoves: CattleMove[];
  feeds: Feed[];
  maintenance: Maintenance[];
  meters: Meter[];
  journals: Journal[];
  sales: Sale[];
  boundaries: Boundary[];
  observations: Observation[];
  documents: DocumentRecord[];
  scenarios: Scenario[];
  beefOrders: BeefOrder[];
};

export const operationKeys = [
  "rations",
  "enterprises",
  "assets",
  "items",
  "lots",
  "movements",
  "seasons",
  "work",
  "harvests",
  "groups",
  "animals",
  "weights",
  "health",
  "reproduction",
  "cattleMoves",
  "feeds",
  "maintenance",
  "meters",
  "journals",
  "sales",
  "boundaries",
  "observations",
  "documents",
  "scenarios",
  "beefOrders",
] as const;
