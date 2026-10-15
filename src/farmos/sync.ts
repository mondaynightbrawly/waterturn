import { canonical } from "./canonical";
import type { Data } from "../model";
import { validate } from "../model";
import { db } from "../storage";
import { requireFarm, newId } from "./domain";
export type SyncRecord = {
  organizationId: string;
  endpoint: string;
  baseRevision: number;
  commandId: string;
  status: "saved-local" | "pending-sync" | "synchronized" | "conflict";
  data?: Data;
  error: string;
  updatedAt: number;
};
export class ApiClient {
  csrf = "";
  constructor(public endpoint: string) {
    const u = new URL(endpoint, location.href);
    if (u.username || u.password || u.search || u.hash)
      throw Error(
        "API addresses cannot contain credentials, query strings or fragments.",
      );
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(u.hostname)
      )
    )
      throw Error("Use HTTPS or an explicit loopback API endpoint.");
    this.endpoint = u.href.replace(/\/$/, "");
  }
  async request(path: string, method = "GET", body?: unknown) {
    const res = await fetch(this.endpoint + path, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(this.csrf ? { "X-CSRF-Token": this.csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok)
      throw Object.assign(Error(json.error ?? "API request failed."), {
        status: res.status,
      });
    return json;
  }
  async login(username: string, password: string) {
    const result = await this.request("/login", "POST", { username, password });
    this.csrf = result.csrfToken;
    return this.request("/session");
  }
  async logout() {
    await this.request("/logout", "POST", {});
    this.csrf = "";
  }
}
export async function queueSnapshot(
  api: ApiClient,
  data: Data,
  baseRevision: number,
) {
  validate(data);
  const organizationId = requireFarm(data).organization.id;
  const existing = await db.sync.get(organizationId);
  if (existing?.status === "conflict")
    throw Error("Resolve the existing synchronization conflict first.");
  const row: SyncRecord = {
    organizationId,
    endpoint: api.endpoint,
    baseRevision,
    commandId: newId(),
    status: "pending-sync",
    data: structuredClone(data),
    error: "",
    updatedAt: Date.now(),
  };
  await db.sync.put(row);
  return row;
}
export async function pushSnapshot(api: ApiClient, organizationId: string) {
  const row = await db.sync.get(organizationId);
  if (!row || !row.data || row.status !== "pending-sync")
    throw Error("No queued snapshot to upload.");
  if (row.endpoint !== api.endpoint)
    throw Error("Queue belongs to another server.");
  try {
    const result = await api.request(
      "/organizations/" + encodeURIComponent(organizationId) + "/commands",
      "POST",
      {
        id: row.commandId,
        expectedRevision: row.baseRevision,
        kind: "replace-state",
        data: row.data,
      },
    );
    const current = await db.state.get("farm");
    const { id: _, ...currentData } = current ?? { id: "farm" };
    const status =
      canonical(currentData) === canonical(row.data)
        ? "synchronized"
        : "saved-local";
    const saved: SyncRecord = {
      ...row,
      data: undefined,
      status,
      baseRevision: result.revision,
      error: "",
      updatedAt: Date.now(),
    };
    await db.sync.put(saved);
    return saved;
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    await db.sync.put({
      ...row,
      status: status === 409 ? "conflict" : "pending-sync",
      error: (e as Error).message,
      updatedAt: Date.now(),
    });
    throw e;
  }
}
