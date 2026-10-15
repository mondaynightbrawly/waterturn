import { FarmCalendar } from "./Calendar";
import React, { useState } from "react";
import type { Data } from "../model";
import { base, requireFarm, activity, type FarmOS } from "./domain";
import {
  ops,
  units,
  cents,
  dollars,
  purchase,
  harvest,
  feed,
  recordFieldwork,
  addExpense,
  acquireAnimal,
  moveAnimal,
  treatment,
  meter,
  correctMeter,
  service,
  maintenanceDue,
  sell,
  enterpriseReport,
  scenarioResult,
  adg,
  withdrawals,
  transferLot,
  inventoryLoss,
  stockSummary,
  allocateCost,
  transact,
  bulkFieldwork,
  productionMetrics,
  reverseExpense,
  feedRation,
  type Unit,
  type Animal,
  type Operations,
} from "./operations";
import { EntryForm, type FormField } from "./FarmScreen";
import { local } from "../format";
import { CattleImporter } from "./CattleImporter";
import {
  FieldMap,
  parseBoundary,
  Reports,
  Documents,
  Assistant,
} from "./advanced";
export function OperationsScreen({
  page,
  data,
  onSave,
}: {
  page: string;
  data: Data;
  onSave: (d: Data) => Promise<unknown>;
}) {
  const f = requireFarm(data),
    o = ops(f);
  const [entry, setEntry] = useState<{ kind: string; id?: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  const date = (at: number) =>
    new Date(at).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const opts = (
    rows: { id: string; name?: string; title?: string; tag?: string }[],
  ) =>
    rows
      .filter((r) => !("archived" in r) || !r.archived)
      .map((r) => ({ value: r.id, label: r.name ?? r.title ?? r.tag ?? r.id }));
  const input = (
    name: string,
    label: string,
    type = "text",
    value: string | number = "",
    required = false,
    min = 0,
  ): FormField => ({ name, label, type, value, required, min });
  const number = (name: string, label: string, value = 0, min = 0) =>
    input(name, label, "number", value, true, min);
  const select = (
    name: string,
    label: string,
    options: { value: string; label: string }[],
    required = false,
    value = "",
  ): FormField => ({ name, label, options, required, value });
  const enumSelect = (
    name: string,
    label: string,
    values: string[],
    value = values[0],
  ) =>
    select(
      name,
      label,
      values.map((value) => ({ value, label: value })),
      true,
      value,
    );
  const at = input(
    "at",
    "Date and time",
    "datetime-local",
    local(Date.now()),
    true,
  );
  const notes = input("notes", "Notes", "textarea");
  const item = select("itemId", "Inventory item", opts(o.items), true);
  const animal = select(
    "animalId",
    "Animal",
    opts(o.animals.filter((a) => a.status === "active")),
    true,
  );
  const group = select("groupId", "Cattle group", opts(o.groups), true);
  const enterprise = select(
    "enterpriseId",
    "Enterprise",
    opts(o.enterprises),
    true,
  );
  const asset = select("assetId", "Equipment", opts(o.assets), true);
  const season = select(
    "seasonId",
    "Crop season",
    o.seasons.map((s) => ({
      value: s.id,
      label: `${s.year} · ${data.fields.find((f) => f.id === s.fieldId)?.name} · ${s.crop}`,
    })),
    true,
  );
  const field = select("fieldId", "Field", opts(data.fields), true);
  const optionalField = { ...field, required: false };
  const optionalAsset = { ...asset, required: false };
  const optionalWorker = select("workerId", "Worker", opts(f.workers));
  const cost = number(
    "cost",
    "Actual cost ($; do not repeat an existing expense)",
  );
  const kinds: Record<string, FormField[]> = {
    enterprise: [
      input("name", "Enterprise name", "text", "", true),
      enumSelect("kind", "Enterprise type", ["crop", "cattle", "other"]),
      number("year", "Reporting year", new Date().getFullYear(), 1900),
      number("budget", "Annual budget ($)"),
    ],
    asset: [
      input("name", "Asset name", "text", "", true),
      enumSelect("category", "Category", [
        "Tractor",
        "Truck",
        "Trailer",
        "Combine",
        "Chopper",
        "Baler",
        "Swather",
        "Planter",
        "Sprayer",
        "Pump",
        "Irrigation structure",
        "Building",
        "Other",
      ]),
      input("make", "Make"),
      input("model", "Model"),
      number("year", "Year", new Date().getFullYear(), 1900),
      input("serial", "Serial number"),
      input("location", "Location"),
      number("purchase", "Purchase price ($; informational only)"),
      number("hours", "Engine hours"),
      number("miles", "Mileage"),
      enumSelect("status", "Operational status", [
        "available",
        "out-of-service",
        "retired",
      ]),
      notes,
    ],
    item: [
      input("name", "Item name", "text", "", true),
      enumSelect("category", "Inventory category", [
        "Seed",
        "Fertilizer",
        "Chemical",
        "Fuel",
        "Parts",
        "Veterinary",
        "Feed",
        "Commodity",
        "Other",
      ]),
      enumSelect("unit", "Base quantity unit", [...units]),
      number("lowStock", "Low stock threshold"),
    ],
    purchase: [
      item,
      number("quantity", "Quantity in item base unit", 1, 0.000001),
      cost,
      input("location", "Storage location", "text", "", true),
      at,
      input("expires", "Expiration date (optional)", "date"),
      input("dryMatter", "Dry matter percent (optional)", "number", "", false),
      input("vendor", "Vendor"),
      notes,
    ],
    transfer: [
      select(
        "lotId",
        "Inventory lot",
        o.lots
          .filter((l) => l.quantity > 0)
          .map((l) => ({
            value: l.id,
            label: `${o.items.find((i) => i.id === l.itemId)?.name} · ${l.location} · ${l.quantity}`,
          })),
        true,
      ),
      number("quantity", "Quantity to transfer", 1, 0.000001),
      input("location", "Destination location", "text", "", true),
      notes,
    ],
    loss: [
      item,
      number("quantity", "Lost quantity in base unit", 1, 0.000001),
      notes,
    ],
    season: [
      field,
      {
        ...enterprise,
        options: opts(o.enterprises.filter((e) => e.kind === "crop")),
      },
      number("year", "Crop year", new Date().getFullYear(), 1900),
      {
        ...input("crop", "Crop", "text", "Corn grain", true),
        suggestions: [
          ...new Set([
            "Corn grain",
            "Corn silage",
            "Wheat",
            "Alfalfa hay",
            "Grass hay",
            ...o.seasons.map((s) => s.crop),
          ]),
        ],
      },
      input("variety", "Variety or hybrid"),
      input("endUse", "Intended end use"),
      number("acres", "Planted acres"),
      input("plantedOn", "Planting date", "date"),
      input("expectedHarvest", "Expected harvest date", "date"),
      input("seedingRate", "Seeding rate with units"),
      number("targetYield", "Target yield quantity"),
      enumSelect("unit", "Yield unit", [...units]),
      input("establishedOn", "Perennial stand establishment date", "date"),
      input("fertilityPlan", "Fertility plan", "textarea"),
      notes,
    ],
    work: [
      season,
      enumSelect("kind", "Activity", [
        "Tillage",
        "Planting",
        "Fertilizing",
        "Spraying",
        "Cultivation",
        "Irrigating",
        "Scouting",
        "Mowing",
        "Raking",
        "Baling",
        "Chopping",
        "Combining",
        "Hauling",
        "Manure application",
        "Soil sampling",
        "Maintenance",
      ]),
      at,
      optionalWorker,
      optionalAsset,
      number("acres", "Acres covered"),
      number("minutes", "Work minutes"),
      number("hours", "Equipment hours used"),
      number("fuel", "Fuel used (gallons)"),
      { ...item, required: false },
      number("inputQuantity", "Inventory quantity consumed (base unit)"),
      input("applicationRate", "Application rate with units"),
      cost,
      input("product", "Chemical product (required for Spraying)"),
      input("registration", "EPA registration (required for Spraying)"),
      input("applicator", "Applicator identity (required for Spraying)"),
      input("certification", "Certification information"),
      input("conditions", "Application conditions"),
      input(
        "requirements",
        "Applicable label/jurisdiction requirements (required for Spraying)",
        "textarea",
      ),
      notes,
    ],
    harvest: [
      season,
      item,
      at,
      number("quantity", "Harvest quantity", 1, 0.000001),
      enumSelect("unit", "Harvest unit", [...units]),
      input(
        "moisturePercent",
        "Moisture percent (optional; blank = unknown)",
        "number",
        "",
        false,
      ),
      input("grade", "Quality or grade"),
      number("cutting", "Cutting / load number", 1, 1),
      number(
        "cost",
        "Production cost to capitalize ($; must already be recorded)",
      ),
      input("location", "Storage destination", "text", "", true),
      notes,
    ],
    group: [
      input("name", "Group name", "text", "", true),
      {
        ...enterprise,
        options: opts(o.enterprises.filter((e) => e.kind === "cattle")),
      },
      enumSelect("class", "Cattle class", [
        "Cow-calf",
        "Replacement heifers",
        "Bulls",
        "Weaned calves",
        "Backgrounding",
        "Finishing",
        "Market-ready",
      ]),
      enumSelect("mode", "Management method", ["individual", "headcount"]),
      number("headCount", "Headcount (headcount mode only)"),
      input("location", "Pasture, lot or pen"),
      notes,
    ],
    animal: [
      input("tag", "Ear tag", "text", "", true),
      input("eid", "Electronic ID"),
      {
        ...group,
        options: opts(o.groups.filter((g) => g.mode === "individual")),
      },
      input("breed", "Breed"),
      enumSelect("sex", "Sex", ["cow", "heifer", "bull", "steer", "calf"]),
      input("bornOn", "Birth date", "date"),
      number("birthWeight", "Birth weight (lb)"),
      select("sireId", "Sire", opts(o.animals)),
      select("damId", "Dam", opts(o.animals)),
      at,
      number("cost", "Acquisition cost ($)"),
      notes,
    ],
    weight: [
      animal,
      at,
      number("weightLb", "Measured weight (lb)", 1, 0.000001),
    ],
    health: [
      { ...animal, required: false },
      { ...group, required: false },
      at,
      enumSelect("kind", "Health event", [
        "Treatment",
        "Vaccination",
        "Illness",
        "Culling",
        "Mortality",
      ]),
      input("product", "Medication or product", "text", "", true),
      input("dosage", "Dosage and route", "text", "", true),
      optionalWorker,
      input("veterinarian", "Veterinarian"),
      input(
        "withdrawal",
        "Withdrawal restriction until",
        "datetime-local",
        "",
        true,
      ),
      cost,
      notes,
    ],
    reproduction: [
      animal,
      enumSelect("kind", "Reproduction event", [
        "exposure",
        "AI",
        "pregnancy-check",
        "calving",
        "weaning",
      ]),
      at,
      select("sireId", "Sire", opts(o.animals)),
      select("calfId", "Recorded calf", opts(o.animals)),
      input("expectedOn", "Expected calving date", "date"),
      input("result", "Result"),
      number("weightLb", "Calf / weaning weight (lb)"),
      input("difficulty", "Calving difficulty"),
      notes,
    ],
    move: [
      animal,
      {
        ...group,
        label: "Destination group",
        name: "toGroupId",
        options: opts(o.groups.filter((g) => g.mode === "individual")),
      },
      notes,
    ],
    feed: [
      group,
      item,
      at,
      number("quantity", "As-fed quantity (item base unit)", 1, 0.000001),
      notes,
    ],
    meter: [
      asset,
      number("hours", "Current engine hours"),
      number("miles", "Current mileage"),
      notes,
    ],
    maintenance: [
      asset,
      input("title", "Service or repair title", "text", "", true),
      input("due", "Due date (optional)", "date"),
      number("dueHours", "Due at engine hours (0 = no meter trigger)"),
      number("dueMiles", "Due at mileage (0 = no mileage trigger)"),
      number("intervalDays", "Repeat every days (0 = once)"),
      number("intervalHours", "Repeat every engine hours"),
      number("intervalMiles", "Repeat every miles"),
      input("symptoms", "Symptoms or service requirements", "textarea"),
      optionalWorker,
      number("downtimeMinutes", "Downtime minutes"),
      notes,
    ],
    service: [
      select(
        "maintenanceId",
        "Open maintenance",
        opts(o.maintenance.filter((m) => m.status === "open")),
        true,
      ),
      number("minutes", "Actual labor minutes"),
      cost,
      input("diagnosis", "Diagnosis / work performed", "textarea", "", true),
      notes,
    ],
    expense: [
      { ...enterprise, required: false },
      optionalField,
      optionalAsset,
      { ...group, required: false },
      { ...animal, required: false },
      at,
      input("description", "Expense description", "text", "", true),
      enumSelect("category", "Expense category", [
        "Seed",
        "Fertilizer",
        "Chemicals",
        "Water",
        "Fuel",
        "Labor",
        "Equipment",
        "Repairs",
        "Custom work",
        "Land rent",
        "Harvest",
        "Trucking",
        "Storage",
        "Feed",
        "Veterinary",
        "Freight",
        "Processing",
        "Overhead",
        "Other",
      ]),
      input("contact", "Vendor / payee"),
      cost,
    ],
    sale: [
      { ...group, required: false, label: "Headcount cattle group (optional)" },
      { ...animal, required: false },
      { ...item, required: false },
      enterprise,
      at,
      number("quantity", "Quantity sold", 1, 0.000001),
      enumSelect("unit", "Sale unit", [...units]),
      number("gross", "Gross sale proceeds ($)"),
      number("fees", "Commissions / freight / processing ($)"),
      input("buyer", "Buyer", "text", "", true),
      number("weightLb", "Sale weight (lb)"),
      enumSelect(
        "withdrawalOverride",
        "Active withdrawal restriction verified externally?",
        ["no", "yes"],
      ),
      notes,
    ],
    allocation: [
      select(
        "journalId",
        "Original expense",
        o.journals
          .filter(
            (j) =>
              j.kind === "expense" &&
              !o.journals.some(
                (a) => a.kind === "allocation" && a.referenceId === j.id,
              ),
          )
          .map((j) => ({
            value: j.id,
            label:
              j.description +
              " · " +
              dollars(j.postings.find((p) => p.cents > 0)?.cents ?? 0),
          })),
        true,
      ),
      input(
        "basis",
        "Documented allocation basis",
        "text",
        "Recorded hours",
        true,
      ),
      { ...enterprise, name: "firstEnterprise", label: "First enterprise" },
      { ...optionalField, name: "firstField", label: "First field" },
      number("firstAmount", "First allocation ($)"),
      {
        ...enterprise,
        name: "secondEnterprise",
        label: "Second enterprise",
        required: false,
      },
      { ...optionalField, name: "secondField", label: "Second field" },
      number("secondAmount", "Second allocation ($)"),
    ],
    scenario: [
      enterprise,
      input("name", "Scenario name", "text", "", true),
      number("quantity", "Baseline production quantity"),
      number("price", "Modeled sale price per unit ($)"),
      number("costChangePercent", "Modeled cost change (%)", 0, -100),
      number("yieldChangePercent", "Modeled yield change (%)", 0, -100),
    ],
    boundary: [
      field,
      input("name", "Boundary name", "text", "", true),
      input(
        "coordinates",
        "GeoJSON Polygon / Feature, or closed [longitude,latitude] coordinate ring",
        "textarea",
        "",
        true,
      ),
    ],
    observation: [
      optionalField,
      at,
      enumSelect("kind", "Observation", [
        "Precipitation",
        "Weather warning",
        "Soil moisture",
        "Field accessibility",
        "Soil test",
        "Nutrient / manure",
        "Safety inspection",
        "Other",
      ]),
      input("value", "Measured value with units / observation"),
      notes,
    ],
    beef: [
      animal,
      input("customer", "Customer", "text", "", true),
      enumSelect("fraction", "Reserved fraction", ["0.25", "0.5", "1"]),
      input("appointment", "Processing appointment", "date"),
      number("hangingLb", "Hanging weight (lb)"),
      number("takeHomeLb", "Take-home yield (lb)"),
      number("price", "Order total ($)"),
      number("deposit", "Deposit recorded ($; informational)"),
      number("processing", "Processing expense ($; informational)"),
      enumSelect("customerPaysProcessor", "Customer pays butcher separately", [
        "yes",
        "no",
      ]),
      notes,
    ],
  };
  kinds.ration = [
    input("name", "Ration name", "text", "", true),
    ...Array.from({ length: 3 }, (_, i) => [
      {
        ...item,
        name: "item" + i,
        label: "Ingredient " + (i + 1),
        required: i === 0,
      },
      number(
        "qty" + i,
        "Ingredient " + (i + 1) + " quantity (base unit, as-fed)",
      ),
    ]).flat(),
    notes,
  ];
  kinds.rationfeed = [
    select("rationId", "Saved ration", opts(o.rations), true),
    group,
    number("multiplier", "Number of recipe batches", 1, 0.000001),
    at,
    notes,
  ];
  kinds.metercorrection = kinds.meter.map((f) =>
    f.name === "notes"
      ? { ...f, label: "Correction reason", required: true }
      : f,
  );
  kinds.bulkwork = kinds.work.map((field) =>
    field.name === "seasonId"
      ? { ...field, label: "Crop seasons (select multiple)", multiple: true }
      : field,
  );
  kinds.reversal = [
    select(
      "journalId",
      "Expense to reverse",
      o.journals
        .filter(
          (j) =>
            j.kind === "expense" &&
            !o.journals.some(
              (r) =>
                r.reversalOf === j.id ||
                (r.kind === "allocation" && r.referenceId === j.id),
            ),
        )
        .map((j) => ({ value: j.id, label: j.description })),
      true,
    ),
    input("reason", "Correction reason", "textarea", "", true),
  ];
  const editable = [
    "animal",
    "boundary",
    "enterprise",
    "asset",
    "item",
    "season",
    "group",
  ];
  const tables: Record<string, keyof Operations> = {
    enterprise: "enterprises",
    asset: "assets",
    item: "items",
    season: "seasons",
    group: "groups",
    boundary: "boundaries",
    animal: "animals",
  };
  const existing =
    entry?.id && tables[entry.kind]
      ? (o[tables[entry.kind]] as unknown as Record<string, unknown>[]).find(
          (r) => r.id === entry.id,
        )
      : undefined;
  let formFields = kinds[entry?.kind ?? ""] ?? [];
  if (existing)
    formFields = formFields.map((field) => ({
      ...field,
      value:
        typeof existing[field.name] === "string" ||
        typeof existing[field.name] === "number"
          ? (existing[field.name] as string | number)
          : field.name === "budget"
            ? Number(existing.budgetCents) / 100
            : field.name === "purchase"
              ? Number(existing.purchaseCents) / 100
              : field.name === "coordinates"
                ? JSON.stringify(existing.coordinates)
                : field.value,
    }));
  if (entry?.kind === "animal" && existing)
    formFields = formFields.filter(
      (field) => !["at", "cost"].includes(field.name),
    );
  async function submit(form: FormData) {
    const str = (n: string) => String(form.get(n) ?? "");
    const num = (n: string) => Number(form.get(n));
    const cash = (n: string) => cents(str(n) || "0");
    const time = () => +new Date(str("at"));
    let next = structuredClone(data);
    let x = requireFarm(next),
      v = ops(x);
    const create = (key: keyof Operations, row: object) => {
      const full: Record<string, unknown> = {
        ...(existing ?? base(x)),
        ...row,
        updatedAt: Date.now(),
      };
      const records = v[key] as unknown as { id: string }[];
      if (existing) {
        const i = records.findIndex((r) => r.id === existing.id);
        records[i] = full as { id: string };
      } else records.push(full as { id: string });
      activity(
        x,
        entry!.kind + ".saved",
        str("name") || str("title") || entry!.kind,
        full.id as string,
      );
    };
    switch (entry?.kind) {
      case "enterprise":
        create("enterprises", {
          name: str("name"),
          kind: str("kind"),
          year: num("year"),
          budgetCents: cash("budget"),
        });
        break;
      case "asset":
        if (
          existing &&
          (existing.hours !== num("hours") || existing.miles !== num("miles"))
        )
          throw Error(
            "Use Log meter or Correct meter to preserve reading history.",
          );
        create("assets", {
          name: str("name"),
          category: str("category"),
          make: str("make"),
          model: str("model"),
          year: num("year"),
          serial: str("serial"),
          location: str("location"),
          purchaseCents: cash("purchase"),
          hours: num("hours"),
          miles: num("miles"),
          status: str("status"),
          notes: str("notes"),
        });
        break;
      case "item": {
        if (
          existing &&
          v.movements.some((m) => m.itemId === existing.id) &&
          existing.unit !== str("unit")
        )
          throw Error(
            "An item unit cannot change after inventory movements. Create a new item.",
          );
        create("items", {
          name: str("name"),
          category: str("category"),
          unit: str("unit"),
          lowStock: num("lowStock"),
        });
        break;
      }
      case "purchase":
        next = purchase(data, {
          itemId: str("itemId"),
          quantity: num("quantity"),
          costCents: cash("cost"),
          location: str("location"),
          at: time(),
          expiry: str("expires")
            ? +new Date(str("expires") + "T23:59:59")
            : undefined,
          dryMatterPercent: str("dryMatter") ? num("dryMatter") : undefined,
          vendor: str("vendor"),
        });
        break;
      case "transfer":
        next = transferLot(
          data,
          str("lotId"),
          num("quantity"),
          str("location"),
          str("notes"),
        );
        break;
      case "loss":
        next = inventoryLoss(
          data,
          str("itemId"),
          num("quantity"),
          str("notes"),
        );
        break;
      case "season":
        create("seasons", {
          fieldId: str("fieldId"),
          enterpriseId: str("enterpriseId"),
          year: num("year"),
          crop: str("crop"),
          variety: str("variety"),
          endUse: str("endUse"),
          acres: num("acres"),
          plantedOn: str("plantedOn"),
          expectedHarvest: str("expectedHarvest"),
          seedingRate: str("seedingRate"),
          targetYield: num("targetYield"),
          unit: str("unit"),
          establishedOn: str("establishedOn"),
          fertilityPlan: str("fertilityPlan"),
          notes: str("notes"),
        });
        break;
      case "bulkwork":
      case "work": {
        const s = v.seasons.find((s) => s.id === str("seasonId"));
        const work = {
          seasonId: str("seasonId"),
          fieldId: s?.fieldId ?? "",
          kind: str("kind"),
          at: time(),
          workerId: str("workerId"),
          assetId: str("assetId"),
          acres: num("acres"),
          minutes: num("minutes"),
          hours: num("hours"),
          fuel: num("fuel"),
          inputItemId: str("itemId"),
          inputQuantity: num("inputQuantity"),
          applicationRate: str("applicationRate"),
          costCents: cash("cost"),
          notes: str("notes"),
          chemical:
            str("kind") === "Spraying"
              ? {
                  product: str("product"),
                  registration: str("registration"),
                  applicator: str("applicator"),
                  certification: str("certification"),
                  conditions: str("conditions"),
                  requirements: str("requirements"),
                }
              : undefined,
        };
        next =
          entry.kind === "bulkwork"
            ? bulkFieldwork(data, form.getAll("seasonId").map(String), work)
            : recordFieldwork(data, work);
        break;
      }
      case "harvest":
        next = harvest(data, {
          seasonId: str("seasonId"),
          at: time(),
          quantity: num("quantity"),
          unit: str("unit") as Unit,
          moisturePercent:
            str("moisturePercent") === "" ? undefined : num("moisturePercent"),
          grade: str("grade"),
          cutting: num("cutting"),
          costCents: cash("cost"),
          notes: str("notes"),
          itemId: str("itemId"),
          location: str("location"),
        });
        break;
      case "group": {
        if (
          existing &&
          existing.enterpriseId !== str("enterpriseId") &&
          (v.animals.some((a) => a.groupId === existing.id) ||
            v.feeds.some((r) => r.groupId === existing.id) ||
            v.journals.some((j) =>
              j.postings.some((p) => p.groupId === existing.id),
            ))
        )
          throw Error(
            "Use animal transfers to move costs between enterprises; this group already has operational history.",
          );
        if (existing && existing.location !== str("location"))
          activity(
            x,
            "cattle.group-location",
            str("name") +
              " · " +
              String(existing.location) +
              " → " +
              str("location"),
            String(existing.id),
          );
        if (
          existing &&
          v.animals.some((a) => a.groupId === existing.id) &&
          existing.mode !== str("mode")
        )
          throw Error(
            "Group management mode cannot change while linked animals exist.",
          );
        create("groups", {
          name: str("name"),
          enterpriseId: str("enterpriseId"),
          class: str("class"),
          headCount: num("headCount"),
          location: str("location"),
          mode: str("mode"),
          notes: str("notes"),
        });
        break;
      }
      case "animal": {
        const profile = {
          tag: str("tag"),
          eid: str("eid"),
          groupId: str("groupId"),
          breed: str("breed"),
          sex: str("sex"),
          bornOn: str("bornOn"),
          birthWeight: num("birthWeight"),
          sireId: str("sireId"),
          damId: str("damId"),
          notes: str("notes"),
        };
        if (existing) {
          if (existing.groupId !== profile.groupId)
            throw Error(
              "Use Move animal so movement and carrying-cost history stay consistent.",
            );
          create("animals", profile);
        } else
          next = acquireAnimal(data, {
            ...profile,
            acquiredAt: time(),
            acquisitionCents: cash("cost"),
            status: "active",
          });
        break;
      }
      case "weight":
        create("weights", {
          animalId: str("animalId"),
          at: time(),
          weightLb: num("weightLb"),
        });
        break;
      case "health":
        next = treatment(data, {
          animalId: str("animalId"),
          groupId: str("groupId"),
          at: time(),
          kind: str("kind"),
          product: str("product"),
          dosage: str("dosage"),
          workerId: str("workerId"),
          veterinarian: str("veterinarian"),
          withdrawalUntil: +new Date(str("withdrawal")),
          costCents: cash("cost"),
          notes: str("notes"),
        });
        break;
      case "reproduction":
        create("reproduction", {
          animalId: str("animalId"),
          kind: str("kind"),
          at: time(),
          sireId: str("sireId"),
          calfId: str("calfId"),
          expectedOn: str("expectedOn"),
          result: str("result"),
          weightLb: num("weightLb"),
          difficulty: str("difficulty"),
          notes: str("notes"),
        });
        break;
      case "move":
        next = moveAnimal(
          data,
          str("animalId"),
          str("toGroupId"),
          str("notes"),
        );
        break;
      case "feed":
        next = feed(data, {
          groupId: str("groupId"),
          itemId: str("itemId"),
          quantity: num("quantity"),
          at: time(),
          notes: str("notes"),
        });
        break;
      case "metercorrection":
        if (
          !confirm(
            "Record this explicit meter correction? Prior readings remain in history.",
          )
        )
          return;
        next = correctMeter(
          data,
          str("assetId"),
          num("hours"),
          num("miles"),
          str("notes"),
          true,
        );
        break;
      case "meter":
        next = meter(
          data,
          str("assetId"),
          num("hours"),
          num("miles"),
          str("notes"),
        );
        break;
      case "maintenance": {
        const row = {
          ...base(x),
          assetId: str("assetId"),
          title: str("title"),
          dueAt: str("due") ? +new Date(str("due") + "T00:00") : 0,
          dueHours: num("dueHours"),
          dueMiles: num("dueMiles"),
          status: "open" as const,
          symptoms: str("symptoms"),
          diagnosis: "",
          workerId: str("workerId"),
          minutes: 0,
          costCents: 0,
          downtimeMinutes: num("downtimeMinutes"),
          workOrderId: "",
          intervalDays: num("intervalDays"),
          intervalHours: num("intervalHours"),
          intervalMiles: num("intervalMiles"),
          notes: str("notes"),
        };
        const task = {
          ...base(x),
          title: row.title,
          description: row.symptoms,
          status: "open" as const,
          priority: "normal" as const,
          dueAt: row.dueAt,
          workerId: row.workerId,
          fieldId: "",
          assetId: row.assetId,
          estimatedMinutes: 0,
          actualMinutes: 0,
          notes: "",
          repeatDays: 0,
        };
        row.workOrderId = task.id;
        x.tasks.push(task);
        v.maintenance.push(row);
        activity(x, "asset.maintenance", row.title, row.id);
        break;
      }
      case "service":
        next = service(
          data,
          str("maintenanceId"),
          num("minutes"),
          cash("cost"),
          str("diagnosis"),
          str("notes"),
        );
        break;
      case "expense":
        next = addExpense(data, {
          enterpriseId: str("enterpriseId"),
          fieldId: str("fieldId"),
          assetId: str("assetId"),
          animalId: str("animalId"),
          groupId: str("groupId"),
          amountCents: cash("cost"),
          description: str("description"),
          category: str("category"),
          contact: str("contact"),
          at: time(),
        });
        break;
      case "sale":
        if (
          str("withdrawalOverride") === "yes" &&
          !confirm(
            "You must independently verify all withdrawal restrictions. Record this explicit override? WaterTurn does not establish slaughter safety.",
          )
        )
          return;
        next = sell(data, {
          groupId: str("groupId"),
          animalId: str("animalId"),
          itemId: str("itemId"),
          enterpriseId: str("enterpriseId"),
          at: time(),
          quantity: num("quantity"),
          unit: str("unit") as Unit,
          grossCents: cash("gross"),
          feesCents: cash("fees"),
          buyer: str("buyer"),
          weightLb: num("weightLb"),
          notes: str("notes"),
          withdrawalOverride: str("withdrawalOverride") === "yes",
        });
        break;
      case "reversal":
        next = reverseExpense(data, str("journalId"), str("reason"));
        break;
      case "allocation":
        next = allocateCost(
          data,
          str("journalId"),
          [
            {
              enterpriseId: str("firstEnterprise"),
              fieldId: str("firstField"),
              groupId: "",
              animalId: "",
              cents: cash("firstAmount"),
            },
            ...(cash("secondAmount")
              ? [
                  {
                    enterpriseId: str("secondEnterprise"),
                    fieldId: str("secondField"),
                    groupId: "",
                    animalId: "",
                    cents: cash("secondAmount"),
                  },
                ]
              : []),
          ],
          str("basis"),
        );
        break;
      case "scenario":
        create("scenarios", {
          enterpriseId: str("enterpriseId"),
          name: str("name"),
          quantity: num("quantity"),
          priceCents: cash("price"),
          costChangePercent: num("costChangePercent"),
          yieldChangePercent: num("yieldChangePercent"),
        });
        break;
      case "boundary":
        create("boundaries", {
          fieldId: str("fieldId"),
          name: str("name"),
          coordinates: parseBoundary(str("coordinates")),
          source: "geojson",
        });
        break;
      case "observation":
        create("observations", {
          fieldId: str("fieldId"),
          at: time(),
          kind: str("kind"),
          value: str("value"),
          notes: str("notes"),
        });
        break;
      case "beef": {
        const reserved = v.beefOrders
          .filter((b) => b.animalId === str("animalId"))
          .reduce((n, b) => n + b.fraction, 0);
        if (reserved + num("fraction") > 1)
          throw Error("Animal reservations exceed one whole beef.");
        create("beefOrders", {
          animalId: str("animalId"),
          customer: str("customer"),
          fraction: num("fraction"),
          appointment: str("appointment"),
          hangingLb: num("hangingLb"),
          takeHomeLb: num("takeHomeLb"),
          priceCents: cash("price"),
          depositCents: cash("deposit"),
          processingCents: cash("processing"),
          customerPaysProcessor: str("customerPaysProcessor") === "yes",
          notes: str("notes"),
        });
        break;
      }
    }
    await onSave(next);
  }
  const buttons: Record<string, [string, string][]> = {
    Inventory: [
      ["item", "Add item"],
      ["purchase", "Receive purchase"],
      ["transfer", "Transfer stock"],
      ["loss", "Record loss"],
    ],
    Crops: [
      ["season", "Plan crop season"],
      ["work", "Log fieldwork"],
      ["bulkwork", "Bulk fieldwork"],
      ["harvest", "Record harvest"],
    ],
    Cattle: [
      ["group", "Add group"],
      ["animal", "Add animal"],
      ["weight", "Record weight"],
      ["health", "Record treatment"],
      ["feed", "Record feeding"],
      ["ration", "Create ration"],
      ["rationfeed", "Feed saved ration"],
      ["reproduction", "Reproduction event"],
      ["move", "Move animal"],
      ["beef", "Beef reservation"],
    ],
    Equipment: [
      ["asset", "Add equipment"],
      ["meter", "Log meter"],
      ["metercorrection", "Correct meter"],
      ["maintenance", "Schedule maintenance"],
      ["service", "Complete service"],
    ],
    Finances: [
      ["enterprise", "Add enterprise"],
      ["expense", "Record expense"],
      ["sale", "Record sale"],
      ["allocation", "Allocate cost"],
      ["scenario", "Model scenario"],
      ["reversal", "Correct an expense"],
    ],
    Maps: [
      ["boundary", "Add field boundary"],
      ["observation", "Field observation"],
    ],
  };
  const open = (kind: string, id?: string) => {
    setError("");
    setEntry({ kind, id });
  };
  const row = (
    id: string,
    title: string,
    detail: React.ReactNode,
    kind?: string,
  ) => (
    <div className="farm-row" key={id}>
      <div className="grow">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {kind && editable.includes(kind) && (
        <button onClick={() => open(kind, id)}>Edit</button>
      )}
    </div>
  );
  return (
    <div className="farmos">
      <div className="pageheading">
        <div>
          <p className="eyebrow">WATERTURN FARMOS · LOCAL OPERATIONS</p>
          <h1>
            {{
              Crops: "Crops & Fieldwork",
              Cattle: "Cattle & Feed",
              Equipment: "Equipment & Maintenance",
              Finances: "Finances & Profitability",
              Maps: "Field Maps",
              Reports: "Reports & Analytics",
              Assistant: "Farm insights",
            }[page] ?? page}
          </h1>
          <p className="subtitle">
            Connected records. Clear assumptions. Saved on this device.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="toolbar">
        {buttons[page]?.map(([kind, label]) => (
          <button
            key={kind}
            className={kind === buttons[page][0][0] ? "primary" : ""}
            onClick={() => open(kind)}
          >
            {label}
          </button>
        ))}
      </div>
      {entry && (
        <EntryForm
          key={entry.kind + entry.id}
          title={
            buttons[page]?.find(([kind]) => kind === entry.kind)?.[1] ??
            "Record " + entry.kind
          }
          fields={formFields}
          submit={submit}
          cancel={() => setEntry(null)}
        />
      )}
      {page === "Inventory" && (
        <>
          <div className="stats">
            <div>
              <span>Inventory items</span>
              <strong>{o.items.length}</strong>
            </div>
            <div>
              <span>Cost-based stock value</span>
              <strong>
                {dollars(o.lots.reduce((n, l) => n + l.valueCents, 0))}
              </strong>
            </div>
            <div>
              <span>Low stock items</span>
              <strong>
                {o.items.filter((i) => stockSummary(f, i.id).low).length}
              </strong>
            </div>
          </div>
          <div className="fieldgrid">
            {o.items.map((i) => {
              const lots = o.lots.filter((l) => l.itemId === i.id),
                quantity = stockSummary(f, i.id).quantity;
              return (
                <article className="panel compact" key={i.id}>
                  <h2>{i.name}</h2>
                  <p>
                    {i.category} · {i.unit} · FIFO cost basis
                  </p>
                  <h3>
                    {quantity.toLocaleString()} {i.unit}
                  </h3>
                  {quantity <= i.lowStock && (
                    <p className="conflict">
                      Low stock · threshold {i.lowStock}
                    </p>
                  )}
                  {lots.map((l) => (
                    <p key={l.id}>
                      {l.location}: {l.quantity} {i.unit} ·{" "}
                      {dollars(l.valueCents)} · {l.origin}
                      {l.expiresAt && l.expiresAt < Date.now()
                        ? " · Expired"
                        : ""}
                    </p>
                  ))}
                  <button onClick={() => open("item", i.id)}>Edit item</button>
                </article>
              );
            })}
          </div>
          <h2>Inventory transaction history</h2>
          <div className="panel farm-list">
            {o.movements
              .slice()
              .reverse()
              .map((m) =>
                row(
                  m.id,
                  o.items.find((i) => i.id === m.itemId)?.name ?? "Item",
                  <>
                    {m.kind} · {m.quantity} · {dollars(m.valueCents)} ·{" "}
                    {date(m.at)} · {m.notes}
                  </>,
                ),
              )}
          </div>
          <p className="notice">
            On-hand balances derive from movement history. Units are never
            implicitly converted. Purchased and internally produced stock retain
            separate lots.
          </p>
        </>
      )}
      {page === "Crops" && (
        <>
          <div className="fieldgrid">
            {o.seasons.map((s) => (
              <article className="panel compact" key={s.id}>
                <span className="eyebrow">
                  {s.year} · {data.fields.find((f) => f.id === s.fieldId)?.name}
                </span>
                <h2>{s.crop}</h2>
                <p>
                  {s.acres} acres · {s.variety} · {s.endUse}
                </p>
                <p>
                  Planted {s.plantedOn || "not recorded"} · Harvest{" "}
                  {s.expectedHarvest || "not planned"}
                </p>
                {s.establishedOn && <p>Stand established {s.establishedOn}</p>}
                <p>
                  Target {s.targetYield} {s.unit} · Actual{" "}
                  {o.harvests
                    .filter((h) => h.seasonId === s.id && h.unit === s.unit)
                    .reduce((n, h) => n + h.quantity, 0)}{" "}
                  {s.unit}
                </p>
                <p>{s.fertilityPlan}</p>
                <button onClick={() => open("season", s.id)}>
                  Edit crop season
                </button>
              </article>
            ))}
          </div>
          <h2>Crop rotation timeline</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  {[...new Set(o.seasons.map((s) => s.year))]
                    .sort()
                    .map((y) => (
                      <th key={y}>{y}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {data.fields.map((f) => (
                  <tr key={f.id}>
                    <th>{f.name}</th>
                    {[...new Set(o.seasons.map((s) => s.year))]
                      .sort()
                      .map((y) => (
                        <td key={y}>
                          {o.seasons
                            .filter((s) => s.fieldId === f.id && s.year === y)
                            .map((s) => s.crop)
                            .join(", ") || "—"}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Fieldwork history</h2>
          <div className="panel farm-list">
            {o.work
              .slice()
              .reverse()
              .map((w) =>
                row(
                  w.id,
                  w.kind +
                    " · " +
                    data.fields.find((f) => f.id === w.fieldId)?.name,
                  <>
                    {date(w.at)} · {w.acres} acres · {w.minutes} min ·{" "}
                    {o.assets.find((a) => a.id === w.assetId)?.name} {w.hours} h
                    · {dollars(w.costCents)} direct cost <br />
                    {w.notes}
                    {w.chemical && (
                      <>
                        <br />
                        Product: {w.chemical.product} · EPA{" "}
                        {w.chemical.registration} · Applicator{" "}
                        {w.chemical.applicator} · {w.chemical.certification}
                        <br />
                        {w.chemical.conditions} · Requirements:{" "}
                        {w.chemical.requirements}
                      </>
                    )}
                  </>,
                ),
              )}
          </div>
          <h2>Harvest loads & hay cuttings</h2>
          <div className="panel farm-list">
            {o.harvests
              .slice()
              .reverse()
              .map((h) =>
                row(
                  h.id,
                  o.seasons.find((s) => s.id === h.seasonId)?.crop ?? "Harvest",
                  <>
                    {date(h.at)} · {h.quantity} {h.unit} ·{" "}
                    {h.moisturePercent === undefined
                      ? "Moisture unknown"
                      : h.moisturePercent + "% moisture"}{" "}
                    · Cutting {h.cutting} · {dollars(h.costCents)} cost to
                    inventory
                  </>,
                ),
              )}
          </div>
          <p className="notice">
            Application records must be reviewed against the applicable label
            and jurisdiction. This form does not establish regulatory
            compliance. Production cost is recorded once in Finances or as
            direct fieldwork cost before harvest capitalization.
          </p>
        </>
      )}
      {page === "Cattle" && (
        <>
          <CattleImporter data={data} onSave={onSave} />
          <div className="stats">
            <div>
              <span>Cattle groups</span>
              <strong>{o.groups.length}</strong>
            </div>
            <div>
              <span>Active head</span>
              <strong>
                {o.groups.reduce(
                  (n, g) =>
                    n +
                    (g.mode === "headcount"
                      ? g.headCount
                      : o.animals.filter(
                          (a) => a.groupId === g.id && a.status === "active",
                        ).length),
                  0,
                )}
              </strong>
            </div>
            <div>
              <span>Active withdrawal records</span>
              <strong>
                {o.health.filter((h) => h.withdrawalUntil >= Date.now()).length}
              </strong>
            </div>
          </div>
          <div className="toolbar">
            <input
              aria-label="Find cattle"
              placeholder="Find ear tag or breed…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="fieldgrid">
            {o.groups.map((g) => (
              <article className="panel compact" key={g.id}>
                <h2>{g.name}</h2>
                <p>
                  {g.class} · {g.location} · {g.mode}
                </p>
                <p>
                  {g.mode === "headcount"
                    ? g.headCount
                    : o.animals.filter(
                        (a) => a.groupId === g.id && a.status === "active",
                      ).length}{" "}
                  head
                </p>
                <p>
                  Total feed cost:{" "}
                  {dollars(
                    o.feeds
                      .filter((r) => r.groupId === g.id)
                      .reduce((n, r) => n + r.costCents, 0),
                  )}
                </p>
                <button onClick={() => open("group", g.id)}>Edit group</button>
              </article>
            ))}
          </div>
          <div className="panel farm-list">
            {o.animals
              .filter((a) =>
                (a.tag + " " + a.breed)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((a) =>
                row(
                  a.id,
                  "Tag " + a.tag,
                  <>
                    {a.breed} · {a.sex} · {a.status} ·{" "}
                    {o.groups.find((g) => g.id === a.groupId)?.name}
                    <br />
                    ADG: {adg(f, a.id) ?? "Need two dated weights"}{" "}
                    {adg(f, a.id) !== null ? "lb/day" : ""}
                    <br />
                    {withdrawals(f, a.id).length > 0 ? (
                      <span className="conflict">
                        Withdrawal restriction recorded · verify independently
                        before sale/slaughter
                      </span>
                    ) : (
                      "No active restriction recorded; this is not a safety clearance."
                    )}
                  </>,
                  "animal",
                ),
              )}
          </div>
          <h2>Feed deliveries</h2>
          <div className="panel farm-list">
            {o.feeds
              .slice()
              .reverse()
              .map((r) =>
                row(
                  r.id,
                  o.groups.find((g) => g.id === r.groupId)?.name ?? "Group",
                  <>
                    {date(r.at)} · {r.quantity} {r.unit} as-fed ·{" "}
                    {dollars(r.costCents)} cost · {r.headCount} head snapshot ·{" "}
                    {dollars(Math.round(r.costCents / r.headCount))}/head this
                    delivery
                    {r.dryMatterQuantity !== undefined
                      ? " · " +
                        r.dryMatterQuantity +
                        " " +
                        r.unit +
                        " dry matter"
                      : " · Dry matter unknown"}
                  </>,
                ),
              )}
          </div>
          <h2>Health & reproduction history</h2>
          <div className="panel farm-list">
            {o.health
              .slice()
              .reverse()
              .map((h) =>
                row(
                  h.id,
                  h.kind +
                    " · " +
                    (o.animals.find((a) => a.id === h.animalId)?.tag ??
                      o.groups.find((g) => g.id === h.groupId)?.name),
                  <>
                    {date(h.at)} · {h.product} · {h.dosage} · {h.veterinarian}
                    <br />
                    Restriction until {date(h.withdrawalUntil)} · {h.notes}
                  </>,
                ),
              )}
            {o.reproduction
              .slice()
              .reverse()
              .map((r) =>
                row(
                  r.id,
                  r.kind +
                    " · " +
                    o.animals.find((a) => a.id === r.animalId)?.tag,
                  <>
                    {date(r.at)} · {r.result} · Expected{" "}
                    {r.expectedOn || "not recorded"} · {r.weightLb} lb ·{" "}
                    {r.difficulty} · {r.notes}
                  </>,
                ),
              )}
          </div>
          <h2>Direct beef reservations</h2>
          <div className="panel farm-list">
            {o.beefOrders.map((b) =>
              row(
                b.id,
                b.customer,
                <>
                  {b.fraction} beef · Tag{" "}
                  {o.animals.find((a) => a.id === b.animalId)?.tag} ·{" "}
                  {b.appointment} · {b.hangingLb} lb hanging / {b.takeHomeLb} lb
                  take home
                  <br />
                  {dollars(b.priceCents)} total · {dollars(b.depositCents)}{" "}
                  deposit noted · {dollars(b.priceCents - b.depositCents)}{" "}
                  balance ·{" "}
                  {b.customerPaysProcessor
                    ? "Customer pays processor separately"
                    : "Farm pays processing"}
                  <br />
                  Reservations/deposits here are informational; record actual
                  cash receipts separately through an approved accounting
                  workflow.
                </>,
              ),
            )}
          </div>
        </>
      )}
      {page === "Equipment" && (
        <>
          <div className="fieldgrid">
            {o.assets.map((a) => (
              <article className="panel compact" key={a.id}>
                <span className="eyebrow">
                  {a.category} · {a.status}
                </span>
                <h2>{a.name}</h2>
                <p>
                  {a.year} {a.make} {a.model} · Serial {a.serial}
                </p>
                <p>
                  {a.hours} engine hours · {a.miles} miles · {a.location}
                </p>
                <p>{a.notes}</p>
                <p>
                  {
                    o.maintenance.filter(
                      (m) => m.assetId === a.id && maintenanceDue(m, a),
                    ).length
                  }{" "}
                  maintenance items due
                </p>
                <button onClick={() => open("asset", a.id)}>
                  Edit equipment
                </button>
              </article>
            ))}
          </div>
          <h2>Service schedule & history</h2>
          <div className="panel farm-list">
            {o.maintenance.map((m) => {
              const a = o.assets.find((a) => a.id === m.assetId)!;
              return row(
                m.id,
                m.title + " · " + a.name,
                <>
                  {maintenanceDue(m, a) ? "DUE NOW · " : ""}
                  {m.status} · {m.dueAt ? date(m.dueAt) : "Meter based"} ·{" "}
                  {m.dueHours || "—"} h / {m.dueMiles || "—"} mi
                  <br />
                  {m.symptoms} {m.diagnosis} · {dollars(m.costCents)} ·{" "}
                  {m.minutes} labor minutes · {m.downtimeMinutes} downtime
                  minutes
                </>,
              );
            })}
          </div>
          <p className="notice">
            Completing service records one expense, completes the linked task,
            and schedules the next interval. Allocate existing expenses in
            Finances rather than entering them again. Asset purchase values are
            informational until separately posted.
          </p>
        </>
      )}
      {page === "Finances" && (
        <>
          <p className="notice">
            Operational management ledger · USD · FIFO cost basis. Positive
            account entries are debits; negative entries are credits. Cash flow,
            production costs, inventory, and recognized operating margin are
            distinct. This does not replace professional accounting.
          </p>
          <div className="fieldgrid">
            {o.enterprises.map((e) => {
              const r = enterpriseReport(f, e.id),
                metrics = productionMetrics(f, e.id);
              return (
                <article className="panel compact" key={e.id}>
                  <span className="eyebrow">
                    {e.year} · {e.kind}
                  </span>
                  <h2>{e.name}</h2>
                  <p>
                    Recorded production inputs: {dollars(r.productionCents)}
                  </p>
                  <p>
                    Budget: {dollars(e.budgetCents)} · Variance{" "}
                    {dollars(e.budgetCents - r.productionCents)}
                  </p>
                  <p>External revenue: {dollars(r.revenueCents)}</p>
                  <p>Recognized expense: {dollars(r.recognizedExpenseCents)}</p>
                  <h3>Operating margin: {dollars(r.operatingMarginCents)}</h3>
                  <p>
                    Remaining work in process: {dollars(r.workInProcessCents)}
                  </p>
                  <p>
                    Cost per recorded acre:{" "}
                    {metrics.costPerAcreCents === null
                      ? "Need acreage"
                      : dollars(metrics.costPerAcreCents)}
                  </p>
                  {metrics.costPerUnit.map((v) => (
                    <p key={v.unit}>
                      Recorded production: {v.quantity} {v.unit} ·{" "}
                      {v.costCents === null ? "—" : dollars(v.costCents)}/{" "}
                      {v.unit}
                    </p>
                  ))}
                  {e.kind === "cattle" && (
                    <p>
                      Observed gain: {metrics.recordedGainLb} lb · Feed cost /
                      observed lb gain:{" "}
                      {metrics.feedCostPerGainCents === null
                        ? "Need dated weights"
                        : dollars(metrics.feedCostPerGainCents)}
                    </p>
                  )}
                  <button onClick={() => open("enterprise", e.id)}>
                    Edit budget / enterprise
                  </button>
                </article>
              );
            })}
          </div>
          <h2>Modeled scenarios · assumptions, not actuals</h2>
          <div className="fieldgrid">
            {o.scenarios.map((s) => {
              const r = scenarioResult(f, s);
              return (
                <article className="panel compact" key={s.id}>
                  <h3>{s.name}</h3>
                  <p>
                    {o.enterprises.find((e) => e.id === s.enterpriseId)?.name}
                  </p>
                  <p>
                    {s.quantity} baseline units at {dollars(s.priceCents)}/unit
                    · Yield {s.yieldChangePercent}% · Costs{" "}
                    {s.costChangePercent}%
                  </p>
                  <p>
                    Modeled quantity {r.quantity} · Revenue{" "}
                    {dollars(r.revenueCents)} · Cost {dollars(r.costCents)}
                  </p>
                  <p>
                    Modeled margin {dollars(r.marginCents)} · Breakeven{" "}
                    {r.breakevenPriceCents === null
                      ? "Unavailable without production quantity"
                      : dollars(r.breakevenPriceCents) + "/unit"}
                  </p>
                </article>
              );
            })}
          </div>
          <h2>Financial posting ledger</h2>
          <div className="panel farm-list">
            {o.journals
              .slice()
              .reverse()
              .map((j) =>
                row(
                  j.id,
                  j.description,
                  <>
                    {date(j.at)} · {j.kind} · {j.category} · {j.contact}
                    <br />
                    {j.postings.map((p, i) => (
                      <span key={i}>
                        {p.account}: {dollars(p.cents)}
                        {p.enterpriseId
                          ? " (" +
                            o.enterprises.find((e) => e.id === p.enterpriseId)
                              ?.name +
                            ")"
                          : ""}{" "}
                        ·{" "}
                      </span>
                    ))}
                  </>,
                ),
              )}
          </div>
        </>
      )}
      {page === "Maps" && (
        <>
          <FieldMap data={data} />
          <div className="panel farm-list">
            {o.boundaries.map((b) =>
              row(
                b.id,
                b.name,
                <>
                  {data.fields.find((f) => f.id === b.fieldId)?.name} ·{" "}
                  {b.coordinates.length - 1} vertices · Coordinates remain local
                </>,
                "boundary",
              ),
            )}
            {o.observations.map((r) =>
              row(
                r.id,
                r.kind,
                <>
                  {date(r.at)} ·{" "}
                  {data.fields.find((f) => f.id === r.fieldId)?.name ?? "Farm"}{" "}
                  · {r.value} · {r.notes}
                </>,
              ),
            )}
          </div>
          <p className="notice">
            No GPS permission, tile service, imagery subscription or coordinate
            upload. Boundaries are sketches in longitude/latitude; recorded
            acreage remains independently entered.
          </p>
        </>
      )}
      {page === "Calendar" && <FarmCalendar data={data} />}
      {page === "Reports" && <Reports data={data} />}
      {page === "Documents" && <Documents data={data} onSave={onSave} />}
      {page === "Assistant" && <Assistant data={data} />}
      {!entry &&
        buttons[page] &&
        !Object.values(o).some((rows) => rows.length) && (
          <div className="empty">
            <h2>Start with shared records.</h2>
            <p>
              Create enterprises in Finances, inventory items in Inventory, and
              equipment in Equipment. Other records link back to them.
            </p>
          </div>
        )}
    </div>
  );
}
