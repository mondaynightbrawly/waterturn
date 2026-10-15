import React, { useEffect, useState } from "react";
import type { ApiClient } from "./sync";
type Member = {
  user_id: string;
  username: string;
  role: string;
  worker_id: string;
  active: boolean;
  scopes: string[];
};
export function MemberAdmin({
  api,
  organizationId,
}: {
  api: ApiClient;
  organizationId: string;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [workers, setWorkers] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const [people, records] = await Promise.all([
      api.request("/organizations/" + organizationId + "/members"),
      api.request("/organizations/" + organizationId + "/records/workers"),
    ]);
    setMembers(people.members);
    setWorkers(records.records);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [organizationId]);
  async function save(body: unknown) {
    setBusy(true);
    try {
      await api.request(
        "/organizations/" + organizationId + "/members",
        "POST",
        body,
      );
      await refresh();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Manage authenticated organization members</summary>
      <p className="notice">
        These server permissions apply to API requests. They are separate from
        local worker labels. The last active owner cannot be removed.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const element = e.currentTarget;
          await save({
            action: "create",
            username: form.get("username"),
            password: form.get("password"),
            role: form.get("role"),
            workerId: form.get("workerId"),
            scopes: form.has("finance") ? ["finance:read"] : [],
          });
          (element.elements.namedItem("password") as HTMLInputElement).value =
            "";
        }}
      >
        <h3>Create a local API user</h3>
        <label>
          New username
          <input
            name="username"
            autoComplete="off"
            required
            pattern="[A-Za-z0-9_.-]{3,80}"
          />
        </label>
        <label>
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={1024}
            required
          />
        </label>
        <label>
          Server role
          <select name="role" defaultValue="employee">
            {["owner", "manager", "employee", "accountant", "readonly"].map(
              (r) => (
                <option key={r}>{r}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Assigned worker
          <select name="workerId">
            <option value="">None</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="finance" />
          Grant manager financial read access
        </label>
        <button disabled={busy}>Create authenticated user</button>
      </form>
      {members.map((m) => (
        <form
          key={m.user_id}
          className="panel form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            save({
              action: "update",
              userId: m.user_id,
              role: form.get("role"),
              workerId: form.get("workerId"),
              active: form.has("active"),
              scopes: form.has("finance") ? ["finance:read"] : [],
            });
          }}
        >
          <strong>{m.username}</strong>
          <label>
            Role for {m.username}
            <select name="role" defaultValue={m.role}>
              {["owner", "manager", "employee", "accountant", "readonly"].map(
                (r) => (
                  <option key={r}>{r}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Worker for {m.username}
            <select name="workerId" defaultValue={m.worker_id}>
              <option value="">None</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input name="active" type="checkbox" defaultChecked={m.active} />
            Active membership
          </label>
          <label className="check">
            <input
              name="finance"
              type="checkbox"
              defaultChecked={m.scopes.includes("finance:read")}
            />
            Manager may read financial data
          </label>
          <button disabled={busy}>Save permissions for {m.username}</button>
        </form>
      ))}
    </details>
  );
}
