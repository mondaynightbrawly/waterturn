import { ServerReports } from "./ServerReports";
import { MemberAdmin } from "./MemberAdmin";
import React, { useState } from "react";
import {
  ApiClient,
  queueSnapshot,
  pushSnapshot,
  type SyncRecord,
} from "./sync";
import { db } from "../storage";
import { validate, type Data } from "../model";
import { requireFarm, prepareOrganizationImport } from "./domain";
import { downloadFile } from "./advanced";
type Member = {
  organization_id: string;
  name: string;
  role: string;
  worker_id: string;
  scopes?: string[];
};
export function SyncPanel({
  data,
  onSave,
}: {
  data: Data;
  onSave: (d: Data) => Promise<unknown>;
}) {
  const [api, setApi] = useState<ApiClient | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [selected, setSelected] = useState(""),
    [revision, setRevision] = useState<number | null>(null),
    [adoption, setAdoption] = useState<{ data: Data; revision: number } | null>(
      null,
    ),
    [message, setMessage] = useState(""),
    [queue, setQueue] = useState<SyncRecord | null>(null),
    [busy, setBusy] = useState(false),
    [tasks, setTasks] = useState<
      { id: string; title: string; status: string }[]
    >([]);
  const member = members.find((m) => m.organization_id === selected);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(client = api, org = selected) {
    if (!client || !org) return;
    const state = await client.request(
      "/organizations/" + encodeURIComponent(org) + "/state",
    );
    setRevision(state.revision);
    setQueue((await db.sync.get(org)) ?? null);
    return state as { data: Data; revision: number };
  }
  return (
    <section className="panel form">
      <h2>Private local API pilot</h2>
      <p>
        Optional PostgreSQL synchronization. Local-only mode remains the
        default. Connect only to a server you control. Public GitHub Pages does
        not provide this API.
      </p>
      {!api ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            run(async () => {
              const client = new ApiClient(String(form.get("endpoint")));
              const session = await client.login(
                String(form.get("username")),
                String(form.get("password")),
              );
              setApi(client);
              setMembers(session.memberships);
              setSelected(session.memberships[0]?.organization_id ?? "");
              setMessage(
                "Authenticated. No local farm data has been uploaded.",
              );
            });
            (
              e.currentTarget.elements.namedItem("password") as HTMLInputElement
            ).value = "";
          }}
        >
          <label>
            API address
            <input
              name="endpoint"
              defaultValue="http://127.0.0.1:8787"
              required
            />
          </label>
          <label>
            Username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Sign in to local API
          </button>
        </form>
      ) : (
        <>
          <label>
            Authenticated organization
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setAdoption(null);
                setRevision(null);
                setQueue(null);
                setTasks([]);
              }}
            >
              {members.map((m) => (
                <option key={m.organization_id} value={m.organization_id}>
                  {m.name} · {m.role}
                </option>
              ))}
            </select>
          </label>
          <p>
            Server role: {member?.role}. Browser records and server records are
            separate until explicitly imported.
          </p>
          {member?.role === "owner" ? (
            <>
              <MemberAdmin api={api} organizationId={selected} />
              <div className="toolbar">
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const state = await inspect();
                      if (state)
                        setMessage(
                          "Server revision " +
                            state.revision +
                            " inspected. Local data unchanged.",
                        );
                    })
                  }
                >
                  Inspect server revision
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const state = await inspect();
                      if (!state) return;
                      validate(state.data);
                      if (
                        confirm(
                          "Replace this browser’s local farm with this authenticated organization? Export a backup first.",
                        )
                      ) {
                        downloadFile(
                          "waterturn-before-server-import.json",
                          JSON.stringify(data, null, 2),
                          "application/json",
                        );
                        await onSave(state.data);
                        setMessage(
                          "Server data saved locally. No local changes uploaded.",
                        );
                      }
                    })
                  }
                >
                  Import server farm locally
                </button>
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const state = await inspect();
                    if (!state) return;
                    const imported = prepareOrganizationImport(
                      data,
                      state.data,
                    );
                    validate(imported);
                    setAdoption({ data: imported, revision: state.revision });
                    setMessage(
                      "Local-farm import prepared for an empty server organization. Nothing has been uploaded.",
                    );
                  })
                }
              >
                Preview existing local farm import
              </button>
              {adoption && (
                <div className="importpreview">
                  <h3>Empty-organization import preview</h3>
                  <p>
                    {adoption.data.fields.length} fields,{" "}
                    {adoption.data.sessions.length} irrigation turns,{" "}
                    {requireFarm(adoption.data).tasks.length} tasks. Financial
                    records and attachments are included. IDs and timestamps are
                    preserved; organization ownership is explicitly reassigned
                    to your authenticated empty destination.
                  </p>
                  <p>
                    Local records stay unchanged. Upload remains a separate
                    action.
                  </p>
                  <button
                    onClick={() =>
                      run(async () => {
                        if (
                          confirm(
                            "Queue all local farm data for upload to this authenticated, empty organization? This includes financial records and attachments.",
                          )
                        ) {
                          downloadFile(
                            "waterturn-before-organization-import.json",
                            JSON.stringify(data),
                            "application/json",
                          );
                          setQueue(
                            await queueSnapshot(
                              api!,
                              adoption.data,
                              adoption.revision,
                            ),
                          );
                          setRevision(adoption.revision);
                          setAdoption(null);
                          setMessage(
                            "Copied farm queued. Upload it explicitly, then import the server farm locally when ready.",
                          );
                        }
                      })
                    }
                  >
                    Confirm copied-farm queue
                  </button>
                  <button onClick={() => setAdoption(null)}>
                    Cancel copied-farm import
                  </button>
                </div>
              )}
              <button
                disabled={busy || revision === null}
                onClick={() =>
                  run(async () => {
                    if (requireFarm(data).organization.id !== selected)
                      throw Error(
                        "Import the selected server farm first. Cross-organization uploads are blocked.",
                      );
                    if (
                      confirm(
                        "Queue this entire local farm, including financials and attachments, for this authenticated owner organization?",
                      )
                    ) {
                      setQueue(await queueSnapshot(api!, data, revision!));
                      setMessage(
                        "Saved locally · pending sync. Nothing uploaded yet.",
                      );
                    }
                  })
                }
              >
                Queue current local snapshot
              </button>
              <button
                disabled={busy || queue?.status !== "pending-sync"}
                onClick={() =>
                  run(async () => {
                    try {
                      const result = await pushSnapshot(api!, selected);
                      setQueue(result);
                      setRevision(result.baseRevision);
                      setMessage(
                        "Queued snapshot synchronized. Subsequent local edits require a new queue.",
                      );
                    } finally {
                      setQueue((await db.sync.get(selected)) ?? null);
                    }
                  })
                }
              >
                Upload queued snapshot
              </button>
              {queue?.status === "conflict" && (
                <div className="error">
                  <p>
                    Conflict: server changed. Export your local backup,
                    inspect/import the current server farm, and reapply intended
                    changes. No automatic overwrite or last-write-wins retry.
                  </p>
                  <button
                    onClick={() =>
                      run(async () => {
                        if (
                          confirm(
                            "Discard only the pending upload? Local farm records remain unchanged.",
                          )
                        ) {
                          await db.sync.delete(selected);
                          setQueue(null);
                          setMessage(
                            "Pending upload discarded. Local farm remains saved.",
                          );
                        }
                      })
                    }
                  >
                    Discard pending upload
                  </button>
                </div>
              )}
              <p>
                Sync state: {queue?.status ?? "saved-local"}
                {queue?.updatedAt
                  ? " · Queue updated " +
                    new Date(queue.updatedAt).toLocaleString()
                  : ""}
                . {queue?.error}
              </p>
            </>
          ) : member?.role === "employee" || member?.role === "manager" ? (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await api!.request(
                      "/organizations/" +
                        encodeURIComponent(selected) +
                        "/records/tasks",
                    );
                    setTasks(result.records);
                    setMessage("Loaded tasks allowed by server permissions.");
                  })
                }
              >
                Load permitted server tasks
              </button>
              {member?.role === "manager" &&
                member.scopes?.includes("finance:read") && (
                  <ServerReports
                    api={api}
                    organizationId={selected}
                    financial
                  />
                )}
              {tasks.map((t) => (
                <div key={t.id} className="farm-row">
                  <strong>{t.title}</strong>
                  <span>{t.status}</span>
                  {t.status !== "completed" && (
                    <button
                      onClick={() =>
                        run(async () => {
                          const minutes = prompt("Actual work minutes", "0");
                          if (minutes === null) return;
                          const overview = await api!.request(
                            "/organizations/" +
                              encodeURIComponent(selected) +
                              "/revision",
                          );
                          await api!.request(
                            "/organizations/" +
                              encodeURIComponent(selected) +
                              "/commands",
                            "POST",
                            {
                              id: crypto.randomUUID(),
                              kind: "complete-task",
                              expectedRevision: overview.revision,
                              taskId: t.id,
                              minutes: Number(minutes),
                              notes: "",
                            },
                          );
                          setTasks(
                            tasks.map((r) =>
                              r.id === t.id ? { ...r, status: "completed" } : r,
                            ),
                          );
                        })
                      }
                    >
                      Complete assigned task
                    </button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <ServerReports
              api={api}
              organizationId={selected}
              financial={member?.role === "accountant"}
            />
          )}
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api!.logout();
                setApi(null);
                setMembers([]);
                setTasks([]);
                setMessage(
                  "Signed out. Local browser records remain; clear them explicitly on a shared device.",
                );
              })
            }
          >
            Sign out of API
          </button>
        </>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <p className="notice">
        Authentication tokens use HTTP-only cookies. Passwords and CSRF tokens
        are not stored in farm backups. No user or default password is created
        automatically. Owner snapshots are explicit and version-checked;
        cross-device merging is not automatic.
      </p>
    </section>
  );
}
