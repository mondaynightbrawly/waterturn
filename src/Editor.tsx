import React, { useState } from "react";
import {
  uid,
  suggestion,
  validate,
  conflicts,
  stopSession,
  moveSession,
  startSession,
  type Data,
} from "./model";
import { duration, local } from "./format";
export function Editor({
  data,
  modal,
  busy,
  onSave,
  onError,
}: {
  data: Data;
  modal: { type: string; id?: string };
  busy: boolean;
  onSave: (d: Data) => Promise<void>;
  onError: (s: string) => void;
}) {
  const type = modal.type;
  const old = data.sessions.find((s) => s.id === modal.id);
  const field = data.fields.find((f) => f.id === modal.id);
  const set = data.sets.find((s) => s.id === modal.id);
  const source = data.sources.find((s) => s.id === modal.id);
  const entity = type === "field" ? field : type === "source" ? source : set;
  const isEntity =
    type === "field" || type === "source" || type.startsWith("set");
  const isStop = type === "stop";
  const isEdit = type === "edit";
  const moving = type === "move";
  const planning = type === "plan" || (isEdit && old?.status === "planned");
  const ordered = data.sets
    .filter((s) => s.fieldId === old?.fieldId && !s.archived)
    .sort((a, b) => a.order - b.order);
  const nextSet = moving
    ? ordered[ordered.findIndex((s) => s.id === old?.setId) + 1]
    : undefined;
  const initial = moving
    ? nextSet
    : data.sets.find((s) => s.id === old?.setId) ||
      data.sets.find(
        (s) =>
          !s.archived && !data.fields.find((f) => f.id === s.fieldId)?.archived,
      );
  const [fieldId, setFieldId] = useState(
    initial?.fieldId ?? data.fields.find((f) => !f.archived)?.id ?? "",
  );
  const [setId, setSetId] = useState(initial?.id ?? "");
  const [sourceId, setSourceId] = useState(
    (isEdit ? old?.sourceId : initial?.sourceId) ??
      data.sources.find((s) => !s.archived)?.id ??
      "",
  );
  const [target, setTarget] = useState(
    isEdit
      ? (old?.target ?? 300)
      : (initial?.duration ?? data.settings.duration),
  );
  const [message, setMessage] = useState("");
  const rec = suggestion(data.sessions, setId);
  const title = isEntity
    ? (entity ? "Edit " : "Add ") +
      (type === "field"
        ? "field"
        : type === "source"
          ? "water source"
          : "irrigation set")
    : isStop
      ? "Stop Water"
      : moving
        ? "Move Water"
        : isEdit
          ? "Edit turn"
          : planning
            ? "Plan a turn"
            : "Start Water";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      let x = structuredClone(data);
      const str = (key: string) => String(f.get(key) ?? "");
      const number = (key: string) => Number(f.get(key));
      if (isEntity) {
        const common = {
          createdAt: entity?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          description: str("description"),
          name: str("name").trim(),
          notes: str("notes"),
          archived: f.has("archived"),
        };
        if (type === "source") {
          const value = {
            id: source?.id ?? uid(),
            ...common,
            maxConcurrentSets: number("capacity"),
            sourceType: str("sourceType"),
          };
          if (source)
            x.sources = x.sources.map((s) => (s.id === source.id ? value : s));
          else x.sources.push(value);
        } else if (type === "field") {
          const value = {
            id: field?.id ?? uid(),
            ...common,
            acreage: number("acreage"),
            crop: str("crop"),
            priority: str("priority"),
            method: str("method"),
            sourceId: str("source"),
            duration: number("duration"),
          };
          if (field)
            x.fields = x.fields.map((a) => (a.id === field.id ? value : a));
          else x.fields.push(value);
        } else {
          const value = {
            id: set?.id ?? uid(),
            ...common,
            fieldId: set?.fieldId ?? type.split(":")[1],
            sourceId: str("source"),
            duration: number("duration"),
            order: number("order"),
            acreage: number("setAcreage"),
          };
          if (set) x.sets = x.sets.map((a) => (a.id === set.id ? value : a));
          else x.sets.push(value);
        }
      } else {
        const at = +new Date(str("at"));
        if (!Number.isFinite(at)) throw Error("Enter a valid timestamp.");
        if (isStop) {
          if (at > Date.now())
            throw Error("Actual stop time cannot be in the future.");
          stopSession(
            x.sessions.find((s) => s.id === old?.id)!,
            at,
          );
        } else if (isEdit && old) {
          const s = x.sessions.find((s) => s.id === old.id)!;
          s.start = at;
          s.target = number("target");
          s.notes = str("notes");
          s.updatedAt = Date.now();
          if (s.status !== "planned" && at > Date.now())
            throw Error("Actual start time cannot be in the future.");
          if (s.status === "completed") {
            s.end = +new Date(str("end"));
            if (s.end > Date.now())
              throw Error("Actual end time cannot be in the future.");
          }
          if (s.status === "planned") {
            const c = conflicts(
              x,
              s.setId,
              s.sourceId,
              s.start,
              s.target,
              true,
              s.id,
            );
            if (c.duplicate.length)
              throw Error("Duplicate overlapping planned set.");
            if (c.capacity) {
              if (
                !confirm(
                  "Source capacity conflict with " +
                    c.affected.map((a) => a.label).join(", ") +
                    ". Confirm intentional override?",
                )
              )
                return;
              s.capacityOverride = true;
            }
          }
        } else {
          const input = {
            setId,
            sourceId,
            start: at,
            target: number("target"),
            notes: str("notes"),
            planned: planning,
            override: false,
          };
          const c = conflicts(
            x,
            setId,
            sourceId,
            at,
            input.target,
            planning,
            moving ? old?.id : undefined,
          );
          if (c.duplicate.length)
            throw Error(
              "This set already has an active or overlapping planned turn.",
            );
          if (c.capacity) {
            if (
              !confirm(
                "Source capacity exceeded. Already assigned: " +
                  c.affected.map((a) => a.label).join(", ") +
                  ". Confirm intentional override?",
              )
            )
              return;
            input.override = true;
          }
          if (moving && old) x = moveSession(x, old.id, input);
          else {
            if (type === "activate" && old)
              x.sessions = x.sessions.filter((s) => s.id !== old.id);
            startSession(x, input);
          }
        }
      }
      validate(x);
      await onSave(x);
    } catch (err) {
      setMessage((err as Error).message);
      onError((err as Error).message);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <span className="eyebrow">WATERTURN · MANUAL CONTROL</span>
      <h2 id="dialogtitle">{title}</h2>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {isEntity ? (
        <>
          <label>
            Name
            <input
              autoFocus
              name="name"
              defaultValue={entity?.name ?? ""}
              required
              maxLength={120}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              defaultValue={entity?.description ?? ""}
            />
          </label>
          {type === "field" && (
            <label>
              Priority
              <select
                name="priority"
                defaultValue={field?.priority ?? "Normal"}
              >
                <option>Low</option>
                <option>Normal</option>
                <option>High</option>
              </select>
            </label>
          )}
          {type.startsWith("set") && (
            <label>
              Set acreage (informational)
              <input
                name="setAcreage"
                type="number"
                min="0"
                step="any"
                defaultValue={set?.acreage ?? 0}
              />
            </label>
          )}
          {type === "source" ? (
            <>
              <label>
                Source type
                <input
                  name="sourceType"
                  defaultValue={source?.sourceType ?? ""}
                />
              </label>
              <label>
                Maximum simultaneous sets
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={source?.maxConcurrentSets ?? 1}
                  required
                />
              </label>
              <p className="notice">
                Capacity counts concurrent sessions, not flow rate. Changing it
                does not stop existing turns.
              </p>
            </>
          ) : (
            <>
              {type === "field" && (
                <>
                  <label>
                    Acreage (informational)
                    <input
                      name="acreage"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={field?.acreage ?? 0}
                    />
                  </label>
                  <label>
                    Crop
                    <input name="crop" defaultValue={field?.crop ?? ""} />
                  </label>
                  <label>
                    Irrigation method
                    <select
                      name="method"
                      defaultValue={field?.method ?? "Furrow irrigation"}
                    >
                      {[
                        "Furrow irrigation",
                        "Flood irrigation",
                        "Gated pipe",
                        "Ditch-fed irrigation",
                        "Siphon tubes",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label>
                Default water source
                <select
                  name="source"
                  defaultValue={
                    (type === "field" ? field?.sourceId : set?.sourceId) ??
                    data.fields.find((f) => f.id === type.split(":")[1])
                      ?.sourceId ??
                    data.sources.find((s) => !s.archived)?.id
                  }
                  required
                >
                  {data.sources
                    .filter(
                      (s) =>
                        !s.archived ||
                        s.id === field?.sourceId ||
                        s.id === set?.sourceId,
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              {!data.sources.length && (
                <p className="error">Add a water source first.</p>
              )}
              <label>
                Default target (minutes)
                <input
                  name="duration"
                  type="number"
                  min="1"
                  defaultValue={
                    (type === "field" ? field?.duration : set?.duration) ??
                    data.settings.duration
                  }
                  required
                />
              </label>
              {type.startsWith("set") && (
                <label>
                  Rotation order
                  <input
                    name="order"
                    type="number"
                    step="1"
                    defaultValue={
                      set?.order ??
                      data.sets.filter((s) => s.fieldId === type.split(":")[1])
                        .length
                    }
                    required
                  />
                </label>
              )}
            </>
          )}
          <label>
            Notes
            <textarea name="notes" defaultValue={entity?.notes ?? ""} />
          </label>
          {entity && (
            <label className="check">
              <input
                name="archived"
                type="checkbox"
                defaultChecked={entity.archived}
              />
              Archive (preserve history)
            </label>
          )}
        </>
      ) : (
        <>
          {old && (
            <p className="notice">
              {moving ? "Moving from: " : isStop ? "Stopping: " : ""}
              {old.label}
            </p>
          )}
          {!isStop && !isEdit && (
            <>
              <label>
                Field
                <select
                  value={fieldId}
                  onChange={(e) => {
                    setFieldId(e.target.value);
                    const s = data.sets.find(
                      (s) => s.fieldId === e.target.value && !s.archived,
                    );
                    setSetId(s?.id ?? "");
                    if (s) {
                      setSourceId(s.sourceId);
                      setTarget(s.duration);
                    }
                  }}
                  required
                >
                  <option value="">Choose field</option>
                  {data.fields
                    .filter((f) => !f.archived)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Irrigation set
                <select
                  value={setId}
                  onChange={(e) => {
                    setSetId(e.target.value);
                    const s = data.sets.find((s) => s.id === e.target.value)!;
                    setSourceId(s.sourceId);
                    setTarget(s.duration);
                  }}
                  required
                >
                  <option value="">Choose set</option>
                  {data.sets
                    .filter((s) => s.fieldId === fieldId && !s.archived)
                    .sort((a, b) => a.order - b.order)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Water source
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  required
                >
                  {data.sources
                    .filter((s) => !s.archived)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <label>
            {isStop
              ? "Actual stop time"
              : moving
                ? "Actual move time"
                : planning
                  ? "Planned start"
                  : "Actual start time"}
            <input
              name="at"
              type="datetime-local"
              defaultValue={local(isEdit && old ? old.start : Date.now())}
              required
            />
          </label>
          {!isStop && (
            <>
              <label>
                Target duration (minutes)
                <input
                  name="target"
                  type="number"
                  min="1"
                  value={target}
                  onChange={(e) => setTarget(+e.target.value)}
                  required
                />
              </label>
              {rec && (
                <div className="notice">
                  Suggested based on {rec.count} previous irrigation sessions:{" "}
                  {duration(rec.minutes * 60000)}. Historical operating
                  patterns, not an agronomic recommendation.
                  <button type="button" onClick={() => setTarget(rec.minutes)}>
                    Use suggestion
                  </button>
                </div>
              )}
              <label>
                Notes
                <textarea
                  name="notes"
                  defaultValue={isEdit ? (old?.notes ?? "") : ""}
                />
              </label>
            </>
          )}
          {isEdit && old?.status === "completed" && (
            <label>
              Actual end time
              <input
                name="end"
                type="datetime-local"
                defaultValue={local(old.end!)}
                required
              />
            </label>
          )}
          <p className="notice">
            This records your physical water change. The app does not operate
            gates.
          </p>
        </>
      )}
      <button className="primary big" disabled={busy}>
        {busy
          ? "Saving…"
          : isStop
            ? "Confirm Stop"
            : moving
              ? "Confirm Move"
              : isEntity
                ? "Save"
                : isEdit
                  ? "Save changes"
                  : planning
                    ? "Save planned turn"
                    : "Confirm Start"}
      </button>
      {isEdit && old?.status === "planned" && (
        <button
          type="button"
          onClick={async () => {
            if (confirm("Cancel this planned turn?")) {
              const x = structuredClone(data);
              x.sessions.find((s) => s.id === old.id)!.status = "canceled";
              try {
                await onSave(x);
              } catch {
                setMessage("Unable to cancel; no changes saved.");
              }
            }
          }}
        >
          Cancel planned turn
        </button>
      )}
    </form>
  );
}
