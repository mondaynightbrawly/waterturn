import { it, expect } from "vitest";
import { demo } from "../demo";
import { upgrade, requireFarm, base } from "./domain";
import {
  prepareConnectorContext,
  inventoryForecast,
  type ConnectorManifest,
} from "./integrations";
import { ops, purchase } from "./operations";
it("blocks external data preparation without explicit destination, scope and sharing consent", () => {
  const d = upgrade(demo());
  const manifest: ConnectorManifest = {
    id: "future-provider",
    name: "Disabled future provider",
    external: true,
    destinations: ["api.example.com"],
    scopes: ["fields:read"],
    canWrite: false,
    costDescription: "No provider configured",
  };
  const consent = {
    enabled: false,
    approvedDomains: ["api.example.com"],
    approvedScopes: ["fields:read" as const],
    dataSharingAcknowledged: true,
  };
  expect(() => prepareConnectorContext(d, manifest, consent)).toThrow(
    /disabled/,
  );
  expect(() =>
    prepareConnectorContext(d, manifest, {
      ...consent,
      enabled: true,
      dataSharingAcknowledged: false,
    }),
  ).toThrow(/consent/);
  expect(() =>
    prepareConnectorContext(d, manifest, {
      ...consent,
      enabled: true,
      approvedDomains: [],
    }),
  ).toThrow(/Destination/);
  const context = prepareConnectorContext(d, manifest, {
    ...consent,
    enabled: true,
  });
  expect(Object.keys(context)).toEqual(["fields"]);
  expect(JSON.stringify(context)).not.toContain("notes");
  expect(JSON.stringify(context)).not.toContain("sessions");
});
it("forecast is explicit about missing consumption history and never mutates records", () => {
  let d = upgrade(demo());
  const f = requireFarm(d),
    item = {
      ...base(f),
      name: "Fictional hay",
      category: "Feed",
      unit: "bale" as const,
      lowStock: 5,
    };
  ops(f).items.push(item);
  d = purchase(d, {
    itemId: item.id,
    quantity: 100,
    costCents: 100000,
    location: "Barn",
    at: Date.now(),
  });
  const before = JSON.stringify(d);
  expect(inventoryForecast(d, item.id).estimatedDaysRemaining).toBeNull();
  expect(JSON.stringify(d)).toBe(before);
});
