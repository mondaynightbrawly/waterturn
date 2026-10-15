import { stockSummary } from "./operations";
import { farmDemo } from "./demo";
import { ops, maintenanceDue } from "./operations";
import React, { useState } from "react";
import {
  Plus,
  ArrowRight,
  CheckCircle2,
  Tractor,
  Leaf,
  ListChecks,
  Search,
  Clock,
} from "lucide-react";
import { type Data, remaining } from "../model";
import {
  requireFarm,
  base,
  activity,
  completeTask,
  type FarmOS,
} from "./domain";
import { duration, local } from "../format";
import "./farmos.css";
import { SyncPanel } from "./SyncPanel";
export type FormField = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  suggestions?: string[];
  value?: string | number | string[];
  required?: boolean;
  multiple?: boolean;
  min?: number;
  step?: string;
  help?: string;
};
export function EntryForm({
  title,
  fields,
  submit,
  cancel,
}: {
  title: string;
  fields: FormField[];
  submit: (f: FormData) => Promise<void>;
  cancel: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="farm-entry">
      <form
        className="panel form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await submit(new FormData(e.currentTarget));
            cancel();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="sectiontitle">
          <h2>{title}</h2>
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select
                name={f.name}
                multiple={f.multiple}
                defaultValue={
                  f.multiple
                    ? Array.isArray(f.value)
                      ? f.value
                      : []
                    : (f.value ?? "")
                }
                required={f.required}
              >
                {!f.required && <option value="">None</option>}
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                defaultValue={f.value ?? ""}
                required={f.required}
              />
            ) : (
              <>
                <input
                  name={f.name}
                  list={f.suggestions ? "suggest-" + f.name : undefined}
                  type={f.type ?? "text"}
                  defaultValue={f.value ?? ""}
                  required={f.required}
                  min={f.min}
                  step={f.step ?? (f.type === "number" ? "any" : undefined)}
                  maxLength={f.type === "text" || !f.type ? 500 : undefined}
                />
                {f.suggestions && (
                  <datalist id={"suggest-" + f.name}>
                    {f.suggestions.map((value) => (
                      <option value={value} key={value} />
                    ))}
                  </datalist>
                )}
              </>
            )}{" "}
            {f.help && <small>{f.help}</small>}
          </label>
        ))}
        <button disabled={busy} className="primary" type="submit">
          {busy ? "Saving…" : "Save record"}
        </button>
      </form>
    </div>
  );
}
export function FarmScreen({
  page,
  data,
  onSave,
  go,
}: {
  page: string;
  data: Data;
  onSave: (d: Data) => Promise<unknown>;
  go: (p: string) => void;
}) {
  const f = requireFarm(data),
    o = ops(f);
  const [entry, setEntry] = useState<{ kind: string; id?: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [mutating, setMutating] = useState(false),
    [query, setQuery] = useState(""),
    [taskStatus, setTaskStatus] = useState("open"),
    [taskView, setTaskView] = useState("list");
  async function change(fn: (f: FarmOS, d: Data) => void) {
    setMutating(true);
    try {
      const next = structuredClone(data);
      fn(requireFarm(next), next);
      await onSave(next);
    } finally {
      setMutating(false);
    }
  }
  const options = (rows: { id: string; name: string }[]) =>
    rows
      .filter((r) => !("archived" in r) || !r.archived)
      .map((r) => ({ value: r.id, label: r.name }));
  const fieldOptions = options(data.fields);
  const now = Date.now();
  const active = data.sessions.filter((s) => s.status === "active");
  const pending = f.tasks.filter(
    (t) => !t.archived && ["open", "in-progress"].includes(t.status),
  );
  const farmDate = (at: number) =>
    at === 0
      ? "Meter/season based · no calendar due date"
      : new Date(at).toLocaleString([], {
          timeZone: f.organization.timezone,
          dateStyle: "medium",
          timeStyle: "short",
        });
  const search = (text: string) =>
    text.toLowerCase().includes(query.toLowerCase());
  let fields: FormField[] = [];
  const t =
    entry?.kind === "task" ? f.tasks.find((t) => t.id === entry.id) : undefined;
  const prop =
    entry?.kind === "property"
      ? f.properties.find((p) => p.id === entry.id)
      : undefined;
  const worker =
    entry?.kind === "worker"
      ? f.workers.find((p) => p.id === entry.id)
      : undefined;
  if (entry?.kind === "farm")
    fields = [
      {
        name: "name",
        label: "Farm name",
        value: f.organization.name,
        required: true,
      },
      {
        name: "timezone",
        label: "Farm time zone",
        value: f.organization.timezone,
        required: true,
        help: "IANA name, for example America/Denver. Irrigation displays device-local times.",
      },
    ];
  if (entry?.kind === "property")
    fields = [
      {
        name: "name",
        label: "Property name",
        value: prop?.name,
        required: true,
      },
      {
        name: "acreage",
        label: "Operated acres",
        type: "number",
        min: 0,
        value: prop?.acreage ?? 0,
        required: true,
      },
      { name: "notes", label: "Notes", type: "textarea", value: prop?.notes },
    ];
  if (entry?.kind === "worker")
    fields = [
      {
        name: "name",
        label: "Worker display name",
        value: worker?.name,
        required: true,
      },
      {
        name: "kind",
        label: "Worker type",
        options: ["owner", "employee", "contractor", "family"].map((value) => ({
          value,
          label: value,
        })),
        value: worker?.kind ?? "employee",
        required: true,
      },
    ];
  if (entry?.kind === "associate")
    fields = [
      {
        name: "fieldId",
        label: "Field",
        options: fieldOptions,
        required: true,
      },
      {
        name: "propertyId",
        label: "Property",
        options: options(f.properties),
        required: true,
      },
    ];
  if (entry?.kind === "task")
    fields = [
      { name: "title", label: "Task title", value: t?.title, required: true },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        value: t?.description,
      },
      {
        name: "due",
        label: "Due date and time",
        type: "datetime-local",
        value: local(t?.dueAt || now),
        required: true,
      },
      {
        name: "priority",
        label: "Priority",
        options: ["low", "normal", "high"].map((value) => ({
          value,
          label: value,
        })),
        value: t?.priority ?? "normal",
        required: true,
      },
      {
        name: "workerId",
        label: "Assigned worker",
        options: options(f.workers),
        value: t?.workerId,
      },
      {
        name: "fieldId",
        label: "Linked field",
        options: fieldOptions,
        value: t?.fieldId,
      },
      {
        name: "estimated",
        label: "Estimated work minutes",
        type: "number",
        min: 0,
        value: t?.estimatedMinutes ?? 0,
        required: true,
      },
      {
        name: "repeat",
        label: "Repeat every N calendar days (0 = once)",
        type: "number",
        min: 0,
        step: "1",
        value: t?.repeatDays ?? 0,
        required: true,
      },
    ];
  if (entry?.kind === "complete")
    fields = [
      {
        name: "minutes",
        label: "Actual work minutes",
        type: "number",
        min: 0,
        value: 0,
        required: true,
      },
      { name: "notes", label: "Completion notes", type: "textarea" },
    ];
  async function submit(form: FormData) {
    const str = (name: string) => String(form.get(name) ?? "");
    const num = (name: string) => Number(form.get(name));
    await change((x, d) => {
      switch (entry?.kind) {
        case "farm":
          x.organization.name = str("name").trim();
          x.organization.timezone = str("timezone");
          d.settings.farmName = x.organization.name;
          break;
        case "property": {
          const row = {
            ...(prop ?? base(x)),
            name: str("name").trim(),
            acreage: num("acreage"),
            notes: str("notes"),
            updatedAt: Date.now(),
          };
          if (prop)
            x.properties = x.properties.map((p) =>
              p.id === prop.id ? row : p,
            );
          else x.properties.push(row);
          activity(x, "property.saved", row.name, row.id);
          break;
        }
        case "worker": {
          const row = {
            ...(worker ?? base(x)),
            name: str("name").trim(),
            kind: str("kind") as "employee",
            updatedAt: Date.now(),
          };
          if (worker)
            x.workers = x.workers.map((p) => (p.id === worker.id ? row : p));
          else x.workers.push(row);
          activity(x, "worker.saved", row.name, row.id);
          break;
        }
        case "associate":
          x.fieldProperties[str("fieldId")] = str("propertyId");
          activity(
            x,
            "field.associated",
            "Field linked to property",
            str("fieldId"),
            str("fieldId"),
          );
          break;
        case "task": {
          const row = {
            ...(t ?? base(x)),
            title: str("title").trim(),
            description: str("description"),
            status: t?.status ?? ("open" as const),
            priority: str("priority") as "normal",
            dueAt: +new Date(str("due")),
            workerId: str("workerId"),
            fieldId: str("fieldId"),
            assetId: t?.assetId ?? "",
            estimatedMinutes: num("estimated"),
            actualMinutes: t?.actualMinutes ?? 0,
            notes: t?.notes ?? "",
            repeatDays: num("repeat"),
            updatedAt: Date.now(),
          };
          if (t) x.tasks = x.tasks.map((p) => (p.id === t.id ? row : p));
          else x.tasks.push(row);
          activity(x, "task.saved", row.title, row.id, row.fieldId);
          break;
        }
        case "complete":
          completeTask(d, entry.id!, num("minutes"), str("notes"));
          break;
      }
    });
  }
  const titles: Record<string, string> = {
    "Farm Home": "Your operation, in view.",
    Properties: "Maps & Fields",
    Tasks: "Today’s work",
    Administration: "Farm administration",
  };
  return (
    <div className="farmos">
      <div className="pageheading">
        <div>
          <p className="eyebrow">WATERTURN FARMOS · SAVED ON THIS DEVICE</p>
          <h1>{titles[page] ?? page}</h1>
          {page === "Farm Home" && (
            <p className="farm-operation-name">{f.organization.name}</p>
          )}
          <p className="subtitle">
            {page === "Farm Home"
              ? "One operation. Every acre. Every animal. Every dollar."
              : f.organization.name + " · " + farmDate(now)}
          </p>
        </div>
        <button
          className="primary"
          onClick={() =>
            setEntry({
              kind:
                page === "Properties"
                  ? "property"
                  : page === "Administration"
                    ? "farm"
                    : "task",
            })
          }
        >
          <Plus size={18} />
          {page === "Properties"
            ? "Add property"
            : page === "Administration"
              ? "Edit farm"
              : "Create task"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {entry && (
        <EntryForm
          key={entry.kind + entry.id}
          title={
            entry.kind === "complete"
              ? "Complete work order"
              : "Record " + entry.kind
          }
          fields={fields}
          submit={submit}
          cancel={() => setEntry(null)}
        />
      )}
      {page === "Farm Home" && (
        <>
          <div className="farm-search">
            <Search size={19} />
            <input
              aria-label="Search farm records"
              placeholder="Find fields, water, tasks, or people…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query && (
            <div className="panel farm-list">
              {[
                ...data.fields.map((r) => ({
                  id: r.id,
                  label: r.name,
                  page: "Fields",
                })),
                ...data.sources.map((r) => ({
                  id: r.id,
                  label: r.name,
                  page: "Fields",
                })),
                ...f.tasks.map((r) => ({
                  id: r.id,
                  label: r.title,
                  page: "Tasks",
                })),
                ...o.assets.map((r) => ({
                  id: r.id,
                  label: r.name,
                  page: "Equipment",
                })),
                ...o.animals.map((r) => ({
                  id: r.id,
                  label: r.tag,
                  page: "Cattle",
                })),
                ...f.workers.map((r) => ({
                  id: r.id,
                  label: r.name,
                  page: "Administration",
                })),
              ]
                .filter((r) => search(r.label))
                .map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setQuery("");
                      go(r.page);
                    }}
                  >
                    {r.label}
                    <ArrowRight size={16} />
                  </button>
                ))}
            </div>
          )}
          <div className="stats">
            <div hidden={!f.widgets.includes("irrigation")}>
              <span>Water running</span>
              <strong>{active.length}</strong>
            </div>
            <div hidden={!f.widgets.includes("tasks")}>
              <span>Open work orders</span>
              <strong>{pending.length}</strong>
            </div>
            <div hidden={!f.widgets.includes("acreage")}>
              <span>Operated acres · properties</span>
              <strong>
                {f.properties
                  .filter((p) => !p.archived)
                  .reduce((n, p) => n + p.acreage, 0)}
              </strong>
            </div>
          </div>
          <div className="stats">
            {f.widgets.includes("equipment") && (
              <div>
                <span>Equipment out of service / maintenance due</span>
                <strong>
                  {o.assets.filter((a) => a.status === "out-of-service").length}{" "}
                  /{" "}
                  {
                    o.maintenance.filter((m) => {
                      const a = o.assets.find((a) => a.id === m.assetId);
                      return a && maintenanceDue(m, a);
                    }).length
                  }
                </strong>
              </div>
            )}
            {f.widgets.includes("inventory") && (
              <div>
                <span>Inventory shortages</span>
                <strong>
                  {o.items.filter((i) => stockSummary(f, i.id).low).length}
                </strong>
              </div>
            )}
            {f.widgets.includes("cattle") && (
              <div>
                <span>Active cattle</span>
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
            )}
          </div>
          <div className="dashboardgrid">
            <section
              hidden={
                !f.widgets.includes("irrigation") &&
                !f.widgets.includes("tasks")
              }
            >
              <div className="sectiontitle">
                <h2>Water & work that need you</h2>
              </div>
              <div className="panel farm-list">
                {(f.widgets.includes("irrigation") ? active : []).map((s) => (
                  <button key={s.id} onClick={() => go("Dashboard")}>
                    <div>
                      <strong>{s.label}</strong>
                      <p>
                        {remaining(s, now) < 0
                          ? "Move overdue · check conditions"
                          : duration(remaining(s, now)) + " to planned move"}
                      </p>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                ))}
                {(f.widgets.includes("tasks") ? pending : [])
                  .sort((a, b) => (a.dueAt || Infinity) - (b.dueAt || Infinity))
                  .slice(0, 5)
                  .map((t) => (
                    <div className="farm-row" key={t.id}>
                      <div>
                        <strong>{t.title}</strong>
                        <p>
                          {farmDate(t.dueAt)} ·{" "}
                          {t.dueAt > 0 && t.dueAt < now
                            ? "Overdue"
                            : t.priority}{" "}
                          ·{" "}
                          {f.workers.find((w) => w.id === t.workerId)?.name ??
                            "Unassigned"}
                        </p>
                      </div>
                      <button
                        onClick={() => setEntry({ kind: "complete", id: t.id })}
                      >
                        Complete
                      </button>
                    </div>
                  ))}
                {!active.length && !pending.length && (
                  <div className="empty">
                    <Leaf />
                    <h3>A clear start to the day.</h3>
                    <p>Create a task or open Irrigation to record water.</p>
                    <button onClick={() => go("Fields")}>
                      Set up fields & water
                    </button>
                  </div>
                )}
              </div>
              <div className="toolbar">
                <button onClick={() => go("Dashboard")}>Open Irrigation</button>
                <button onClick={() => go("Properties")}>
                  Manage properties
                </button>
              </div>
            </section>
            <section hidden={!f.widgets.includes("activity")}>
              <div className="sectiontitle">
                <h2>Farm Activity Ledger</h2>
              </div>
              <div className="panel farm-list">
                {f.activities
                  .slice(-10)
                  .reverse()
                  .map((a) => (
                    <div className="farm-row" key={a.id}>
                      <CheckCircle2 size={17} />
                      <div>
                        <strong>{a.summary}</strong>
                        <p>
                          {farmDate(a.at)} · {a.kind}
                        </p>
                      </div>
                    </div>
                  ))}
                {!f.activities.length && (
                  <div className="empty">
                    <Clock />
                    <p>
                      New recorded work will appear here. Existing irrigation
                      history is preserved in Irrigation.
                    </p>
                  </div>
                )}
              </div>
              <div className="fieldnote">
                <Leaf />
                <p>
                  On-device mode. Optional authenticated server access is in
                  Administration. Export regular backups from Settings.
                </p>
              </div>
            </section>
          </div>
          <details className="panel compact">
            <summary>Customize home widgets</summary>
            <div className="toolbar">
              {[
                "irrigation",
                "tasks",
                "acreage",
                "activity",
                "equipment",
                "inventory",
                "cattle",
              ].map((key) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    disabled={mutating}
                    checked={f.widgets.includes(key)}
                    onChange={() =>
                      change((x) => {
                        x.widgets = x.widgets.includes(key)
                          ? x.widgets.filter((v) => v !== key)
                          : [...x.widgets, key];
                      }).catch((e) => setError(e.message))
                    }
                  />
                  {key}
                </label>
              ))}
            </div>
          </details>
          <div className="demobanner">
            <div>
              <strong>Explore a fictional connected farm.</strong>
              <p>
                Optional demonstration only. Loading it replaces all current
                local farm records; export a backup first.
              </p>
            </div>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Replace the entire local farm with fictional FarmOS demonstration records? Export your backup first.",
                  )
                )
                  onSave(farmDemo()).catch((e) => setError(e.message));
              }}
            >
              Load fictional FarmOS demo
            </button>
          </div>
          {!data.fields.length && (
            <div className="demobanner">
              <div>
                <strong>Explore the original fictional WaterTurn farm.</strong>
                <p>
                  Optional sample irrigation data; nothing is loaded
                  automatically.
                </p>
              </div>
              <button onClick={() => go("Dashboard")}>
                Open irrigation demo
              </button>
            </div>
          )}
        </>
      )}
      {page === "Properties" && (
        <>
          <div className="toolbar">
            <button onClick={() => go("Fields")}>
              Manage fields & irrigation sets
            </button>
            <button
              disabled={!f.properties.length || !data.fields.length}
              onClick={() => setEntry({ kind: "associate" })}
            >
              Link a field to property
            </button>
          </div>
          <div className="fieldgrid">
            {f.properties.map((p) => (
              <article key={p.id} className="panel compact">
                <h2>{p.name}</h2>
                <p>
                  {p.acreage} operated acres ·{" "}
                  {p.archived ? "Archived" : "Active"}
                </p>
                <p>{p.notes}</p>
                {data.fields
                  .filter((field) => f.fieldProperties[field.id] === p.id)
                  .map((field) => (
                    <p key={field.id}>
                      <Leaf size={14} /> {field.name} · {field.acreage} acres
                    </p>
                  ))}
                <button
                  onClick={() => setEntry({ kind: "property", id: p.id })}
                >
                  Edit property
                </button>
                <button
                  onClick={() =>
                    change((x) => {
                      const row = x.properties.find((a) => a.id === p.id)!;
                      row.archived = !row.archived;
                      activity(x, "property.archived", row.name, row.id);
                    }).catch((e) => setError(e.message))
                  }
                >
                  {p.archived ? "Restore" : "Archive"}
                </button>
              </article>
            ))}
          </div>
          {!f.properties.length && (
            <p className="empty">
              Add a property, then link existing fields. GPS coordinates are
              optional.
            </p>
          )}
        </>
      )}
      {page === "Tasks" && (
        <>
          <div className="toolbar">
            <label>
              Task view
              <select
                value={taskView}
                onChange={(e) => setTaskView(e.target.value)}
              >
                <option value="list">Task list</option>
                <option value="week">Next 7 days</option>
              </select>
            </label>
            <input
              aria-label="Search tasks"
              placeholder="Search work orders…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Task status"
              value={taskStatus}
              onChange={(e) => setTaskStatus(e.target.value)}
            >
              {[
                "open",
                "in-progress",
                "completed",
                "canceled",
                "all",
                "overdue",
                "today",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          {taskView === "week" && (
            <div className="week">
              {Array.from({ length: 7 }, (_, i) => {
                const start = new Date();
                start.setHours(0, 0, 0, 0);
                start.setDate(start.getDate() + i);
                const end = new Date(start);
                end.setDate(end.getDate() + 1);
                return (
                  <section className="panel compact" key={i}>
                    <h3>
                      {start.toLocaleDateString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </h3>
                    {f.tasks
                      .filter(
                        (t) =>
                          t.dueAt >= +start && t.dueAt < +end && !t.archived,
                      )
                      .map((t) => (
                        <div className="calendaritem" key={t.id}>
                          <strong>{t.title}</strong>
                          <p>
                            {t.status} · {t.priority}
                          </p>
                          {["open", "in-progress"].includes(t.status) && (
                            <button
                              onClick={() =>
                                setEntry({ kind: "complete", id: t.id })
                              }
                            >
                              Complete task
                            </button>
                          )}
                        </div>
                      ))}
                  </section>
                );
              })}
            </div>
          )}
          <div className="panel farm-list">
            {f.tasks
              .filter(
                (t) =>
                  !t.archived &&
                  search(t.title + " " + t.description) &&
                  (taskStatus === "all" || taskStatus === "overdue"
                    ? taskStatus === "all" ||
                      (t.dueAt > 0 &&
                        t.dueAt < now &&
                        ["open", "in-progress"].includes(t.status))
                    : taskStatus === "today"
                      ? new Date(t.dueAt).toDateString() ===
                        new Date(now).toDateString()
                      : t.status === taskStatus),
              )
              .sort((a, b) => (a.dueAt || Infinity) - (b.dueAt || Infinity))
              .map((t) => (
                <div className="farm-row" key={t.id}>
                  <div className="grow">
                    <strong>{t.title}</strong>
                    <p>{t.description}</p>
                    <p>
                      {farmDate(t.dueAt)} · {t.priority} · {t.status} ·{" "}
                      {f.workers.find((w) => w.id === t.workerId)?.name ??
                        "Unassigned"}
                    </p>
                    <small>
                      {data.fields.find((p) => p.id === t.fieldId)?.name} ·{" "}
                      {t.actualMinutes} recorded minutes {t.notes}
                    </small>
                  </div>
                  <button onClick={() => setEntry({ kind: "task", id: t.id })}>
                    Edit
                  </button>
                  {["open", "in-progress"].includes(t.status) && (
                    <>
                      <button
                        className="primary"
                        onClick={() => setEntry({ kind: "complete", id: t.id })}
                      >
                        Complete
                      </button>
                      <button
                        onClick={() =>
                          change((x) => {
                            const r = x.tasks.find((a) => a.id === t.id)!;
                            r.status =
                              r.status === "open" ? "in-progress" : "open";
                            activity(
                              x,
                              "task.status",
                              r.title + " · " + r.status,
                              r.id,
                              r.fieldId,
                            );
                          }).catch((e) => setError(e.message))
                        }
                      >
                        {t.status === "open" ? "Begin" : "Reopen"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Cancel this work order?"))
                            change((x) => {
                              const row = x.tasks.find((a) => a.id === t.id)!;
                              row.status = "canceled";
                              activity(
                                x,
                                "task.canceled",
                                row.title,
                                row.id,
                                row.fieldId,
                              );
                            }).catch((e) => setError(e.message));
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              ))}
          </div>
        </>
      )}
      {page === "Administration" && (
        <>
          <SyncPanel data={data} onSave={onSave} />
          <div className="panel compact">
            <h2>{f.organization.name}</h2>
            <p>{f.organization.timezone} · USD · Saved locally</p>
            <p>
              Workers are assignment labels, not authenticated users. No
              permissions or cloud sharing are implied.
            </p>
            <button onClick={() => go("Settings")}>
              Preferences, full backup & restore
            </button>
          </div>
          <div className="sectiontitle">
            <h2>People in the operation</h2>
            <button onClick={() => setEntry({ kind: "worker" })}>
              Add worker
            </button>
          </div>
          <div className="fieldgrid">
            {f.workers.map((w) => (
              <div className="panel compact" key={w.id}>
                <h3>{w.name}</h3>
                <p>{w.kind}</p>
                <button onClick={() => setEntry({ kind: "worker", id: w.id })}>
                  Edit worker
                </button>
              </div>
            ))}
          </div>
          <p className="notice">
            This build is for local experimentation. Use fictional people and
            farm information. The application cannot isolate records from
            another person using the same browser profile.
          </p>
        </>
      )}
    </div>
  );
}
