import type { Data } from "../model";
import { requireFarm } from "./domain";
import { ops, enterpriseReport, stockSummary } from "./operations";
export type Scope = "fields:read" | "equipment:read" | "finance:read";
export type ConnectorManifest = {
  id: string;
  name: string;
  external: boolean;
  destinations: string[];
  scopes: Scope[];
  canWrite: false;
  costDescription: string;
};
export type ConnectorConsent = {
  enabled: boolean;
  approvedDomains: string[];
  approvedScopes: Scope[];
  dataSharingAcknowledged: boolean;
};
export const disabledIntegrations = [
  "AI provider",
  "Weather",
  "Telematics",
  "Scale / EID",
  "Flow meter",
  "Accounting",
] as const;
/** A provider-neutral preparation boundary. No network transport or credentials are implemented. */
export function prepareConnectorContext(
  d: Data,
  manifest: ConnectorManifest,
  consent: ConnectorConsent,
) {
  if (!consent.enabled) throw Error("Integration is disabled.");
  if (manifest.canWrite !== false)
    throw Error("Connector writes are not enabled.");
  if (manifest.external && !consent.dataSharingAcknowledged)
    throw Error("Explicit data-sharing consent is required.");
  for (const host of manifest.destinations)
    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host) ||
      !consent.approvedDomains.includes(host)
    )
      throw Error("Destination has not been approved.");
  if (manifest.external && !manifest.destinations.length)
    throw Error("External connector needs an approved destination.");
  for (const scope of manifest.scopes)
    if (
      !["fields:read", "equipment:read", "finance:read"].includes(scope) ||
      !consent.approvedScopes.includes(scope)
    )
      throw Error("Data scope has not been authorized.");
  const f = requireFarm(d),
    o = ops(f);
  const context: Record<string, unknown> = {};
  if (manifest.scopes.includes("fields:read"))
    context.fields = d.fields.map((r) => ({
      id: r.id,
      name: r.name,
      acreage: r.acreage,
      crop: r.crop,
    }));
  if (manifest.scopes.includes("equipment:read"))
    context.equipment = o.assets.map((r) => ({
      id: r.id,
      name: r.name,
      hours: r.hours,
      status: r.status,
    }));
  if (manifest.scopes.includes("finance:read"))
    context.financials = o.enterprises.map((e) => ({
      id: e.id,
      name: e.name,
      ...enterpriseReport(f, e.id),
    }));
  return structuredClone(context);
}
export function inventoryForecast(d: Data, itemId: string, now = Date.now()) {
  const o = ops(requireFarm(d));
  const remaining = stockSummary(requireFarm(d), itemId).quantity;
  const consumed = o.movements
    .filter(
      (m) =>
        m.itemId === itemId &&
        ["feed", "application", "loss"].includes(m.kind) &&
        m.quantity < 0 &&
        m.at >= now - 30 * 86400000 &&
        m.at <= now,
    )
    .reduce((n, m) => n - m.quantity, 0);
  const perDay = consumed / 30;
  return {
    remaining,
    consumedLast30Days: consumed,
    assumedDailyUse: perDay,
    estimatedDaysRemaining: perDay > 0 ? remaining / perDay : null,
    assumption:
      "Last 30 days of recorded feed/application/loss withdrawals divided by 30; unrecorded usage is unknown.",
  };
}
