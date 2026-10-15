import { stockSummary } from "./operations";
import { inventoryForecast } from "./integrations";
import React, { useState } from "react";
import { Download, Search, FileText, ShieldCheck } from "lucide-react";
import type { Data } from "../model";
import { elapsed } from "../model";
import { ops, enterpriseReport, dollars, maintenanceDue } from "./operations";
import { requireFarm, base, activity } from "./domain";
export { parseBoundary } from "./geometry";
export function attachmentName(name: string, mime: string) {
  const extensions: Record<string, string> = {
    "text/plain": ".txt",
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
  };
  const filename = name.split(/[\\/]/).at(-1) ?? "";
  const stem =
    filename
      .replace(/[\u0000-\u001f<>:"|?*]/g, "_")
      .replace(/\.[^.]*$/, "")
      .slice(0, 120) || "attachment";
  return stem + (extensions[mime] ?? ".bin");
}
export function downloadFile(name: string, content: BlobPart, type: string) {
  const u = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function csvRows(rows: unknown[][]) {
  const quote = (value: unknown) =>
    '"' +
    String(value ?? "")
      .replace(/^\s*[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}
export function FieldMap({ data }: { data: Data }) {
  const o = ops(requireFarm(data));
  const [selected, setSelected] = useState(""),
    [overlay, setOverlay] = useState("irrigation");
  const points = o.boundaries.flatMap((b) => b.coordinates);
  if (!points.length)
    return (
      <div className="empty panel">
        <h2>Fields, without a mapping subscription.</h2>
        <p>
          Add an optional GeoJSON boundary or coordinate ring. You can keep
          using fields without coordinates.
        </p>
      </div>
    );
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys),
    x = (n: number) => 30 + ((n - minX) / (maxX - minX || 1)) * 740,
    y = (n: number) => 430 - ((n - minY) / (maxY - minY || 1)) * 400;
  const field = data.fields.find((f) => f.id === selected);
  const color = (id: string) =>
    overlay === "irrigation"
      ? data.sessions.some((s) => s.fieldId === id && s.status === "active")
        ? "#4b9b7d"
        : "#b3c5a3"
      : overlay === "crop"
        ? o.seasons
            .filter((s) => s.fieldId === id)
            .at(-1)
            ?.crop.includes("Corn")
          ? "#d7af5b"
          : "#8fb278"
        : overlay === "fieldwork"
          ? o.work.some((w) => w.fieldId === id)
            ? "#588caf"
            : "#bac5b0"
          : "#7ba388";
  return (
    <section className="panel map-panel">
      <div className="toolbar">
        <label>
          Map overlay
          <select value={overlay} onChange={(e) => setOverlay(e.target.value)}>
            <option value="irrigation">Irrigation status</option>
            <option value="crop">Current recorded crop</option>
            <option value="fieldwork">Recorded fieldwork</option>
          </select>
        </label>
        <button
          onClick={() =>
            downloadFile(
              "waterturn-fields.geojson",
              JSON.stringify(
                {
                  type: "FeatureCollection",
                  features: o.boundaries.map((b) => ({
                    type: "Feature",
                    properties: { name: b.name, fieldId: b.fieldId },
                    geometry: { type: "Polygon", coordinates: [b.coordinates] },
                  })),
                },
                null,
                2,
              ),
              "application/geo+json",
            )
          }
        >
          Export GeoJSON
        </button>
      </div>
      <svg
        viewBox="0 0 800 460"
        role="img"
        aria-label="Local field boundary sketch"
      >
        {o.boundaries.map((b) => (
          <g
            key={b.id}
            role="button"
            tabIndex={0}
            aria-label={"Open field " + b.name}
            onClick={() => setSelected(b.fieldId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelected(b.fieldId);
              }
            }}
          >
            <polygon
              points={b.coordinates
                .map((p) => `${x(p[0])},${y(p[1])}`)
                .join(" ")}
              fill={color(b.fieldId)}
              fillOpacity=".65"
              stroke={selected === b.fieldId ? "#124a36" : "#fff"}
              strokeWidth="3"
            />
            <text
              x={x(b.coordinates[0][0]) + 8}
              y={y(b.coordinates[0][1]) - 10}
              fontSize="14"
              fill="currentColor"
            >
              {b.name}
            </text>
          </g>
        ))}
      </svg>
      {field && (
        <div className="compact">
          <h3>{field.name}</h3>
          <p>
            {field.acreage} recorded acres · {field.crop} · {field.method}
          </p>
          <p>{field.notes}</p>
        </div>
      )}
      <p className="notice">
        Schematic boundary view, not a surveyed map or an acreage measurement.
        No external tiles or location services.
      </p>
    </section>
  );
}
export function Reports({ data }: { data: Data }) {
  const f = requireFarm(data),
    o = ops(f);
  const [kind, setKind] = useState("enterprise");
  const dt = (n: number) => new Date(n).toISOString();
  const tables: Record<string, unknown[][]> = {
    enterprise: [
      [
        "Enterprise",
        "Year",
        "Production cost USD",
        "Revenue USD",
        "Recognized expense USD",
        "Operating margin USD",
        "Remaining WIP USD",
      ],
      ...o.enterprises.map((e) => {
        const r = enterpriseReport(f, e.id);
        return [
          e.name,
          e.year,
          r.productionCents / 100,
          r.revenueCents / 100,
          r.recognizedExpenseCents / 100,
          r.operatingMarginCents / 100,
          r.workInProcessCents / 100,
        ];
      }),
    ],
    inventory: [
      ["Item", "Location", "Origin", "Quantity", "Unit", "Value USD"],
      ...o.lots.map((l) => [
        o.items.find((i) => i.id === l.itemId)?.name,
        l.location,
        l.origin,
        l.quantity,
        o.items.find((i) => i.id === l.itemId)?.unit,
        l.valueCents / 100,
      ]),
    ],
    irrigation: [
      [
        "Field / set",
        "Source",
        "Status",
        "Start UTC",
        "End UTC",
        "Actual hours",
        "Target hours",
        "Notes",
      ],
      ...data.sessions.map((s) => [
        s.label,
        s.sourceName,
        s.status,
        dt(s.start),
        s.end ? dt(s.end) : "",
        s.end ? elapsed(s) / 3600000 : "",
        s.target / 60,
        s.notes,
      ]),
    ],
    fieldwork: [
      [
        "Field",
        "Activity",
        "Date UTC",
        "Acres",
        "Minutes",
        "Equipment",
        "Hours",
        "Direct cost USD",
        "Notes",
      ],
      ...o.work.map((w) => [
        data.fields.find((f) => f.id === w.fieldId)?.name,
        w.kind,
        dt(w.at),
        w.acres,
        w.minutes,
        o.assets.find((a) => a.id === w.assetId)?.name,
        w.hours,
        w.costCents / 100,
        w.notes,
      ]),
    ],
    rotation: [
      [
        "Field",
        "Year",
        "Crop",
        "Variety",
        "Acres",
        "Planted",
        "Stand established",
      ],
      ...o.seasons.map((s) => [
        data.fields.find((f) => f.id === s.fieldId)?.name,
        s.year,
        s.crop,
        s.variety,
        s.acres,
        s.plantedOn,
        s.establishedOn,
      ]),
    ],
    health: [
      [
        "Animal",
        "Group",
        "Event",
        "Date UTC",
        "Product",
        "Dosage",
        "Veterinarian",
        "Withdrawal until UTC",
        "Notes",
      ],
      ...o.health.map((h) => [
        o.animals.find((a) => a.id === h.animalId)?.tag,
        o.groups.find((g) => g.id === h.groupId)?.name,
        h.kind,
        dt(h.at),
        h.product,
        h.dosage,
        h.veterinarian,
        dt(h.withdrawalUntil),
        h.notes,
      ]),
    ],
    equipment: [
      [
        "Asset",
        "Status",
        "Hours",
        "Miles",
        "Service title",
        "Service status",
        "Due UTC",
        "Cost USD",
      ],
      ...o.assets.flatMap((a) => {
        const records = o.maintenance.filter((m) => m.assetId === a.id);
        return records.length
          ? records.map((m) => [
              a.name,
              a.status,
              a.hours,
              a.miles,
              m.title,
              m.status,
              m.dueAt ? dt(m.dueAt) : "",
              m.costCents / 100,
            ])
          : [[a.name, a.status, a.hours, a.miles, "", "", "", ""]];
      }),
    ],
    activity: [
      ["Occurred UTC", "Event", "Summary", "Record ID"],
      ...f.activities.map((a) => [dt(a.at), a.kind, a.summary, a.entityId]),
    ],
    cash: [
      ["Date UTC", "Description", "Cash flow USD", "Kind"],
      ...o.journals
        .filter((j) => j.postings.some((p) => p.account === "cash"))
        .map((j) => [
          dt(j.at),
          j.description,
          j.postings
            .filter((p) => p.account === "cash")
            .reduce((n, p) => n + p.cents, 0) / 100,
          j.kind,
        ]),
    ],
  };
  const rows = tables[kind];
  return (
    <>
      <div className="toolbar">
        <label>
          Report
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.keys(tables).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            downloadFile(
              "waterturn-" + kind + ".csv",
              csvRows(rows),
              "text/csv",
            )
          }
        >
          <Download size={16} /> Export CSV
        </button>
        <button onClick={() => window.print()}>Print / save PDF</button>
      </div>
      <p className="notice">
        {f.organization.name} · Generated {new Date().toLocaleString()} · Local
        records only. Operational figures are not a tax return, water-volume
        calculation, or regulatory certification.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {rows[0].map((v, i) => (
                <th key={i}>{String(v)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j}>{String(v ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function Documents({
  data,
  onSave,
}: {
  data: Data;
  onSave: (d: Data) => Promise<unknown>;
}) {
  const [error, setError] = useState(""),
    [fieldId, setFieldId] = useState(""),
    [assetId, setAssetId] = useState("");
  const f = requireFarm(data),
    o = ops(f);
  async function add(file: File) {
    if (file.size > 2 * 1024 * 1024)
      throw Error("Maximum attachment size is 2 MB.");
    if (
      !["text/plain", "application/pdf", "image/png", "image/jpeg"].includes(
        file.type,
      )
    )
      throw Error("Choose plain text, PDF, PNG or JPEG.");
    const content = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(Error("File could not be read."));
      r.readAsDataURL(file);
    });
    const next = structuredClone(data),
      x = requireFarm(next),
      record = {
        ...base(x),
        name: file.name,
        mime: file.type,
        data: content,
        fieldId,
        assetId,
        notes: "",
      };
    ops(x).documents.push(record);
    activity(x, "document.added", file.name, record.id, fieldId);
    await onSave(next);
  }
  return (
    <>
      <p className="notice">
        Attachments stay in this browser and are included in full JSON backups.
        Use fictional files during the prototype. Large files can exhaust
        browser storage. Maximum 2 MB per file.
      </p>
      <div className="toolbar">
        <label>
          Linked field
          <select value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
            <option value="">None</option>
            {data.fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Linked equipment
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">None</option>
            {o.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Add local attachment
          <input
            type="file"
            accept=".txt,.pdf,.png,.jpg,.jpeg"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              try {
                if (file) await add(file);
                setError("");
              } catch (err) {
                setError((err as Error).message);
              }
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="panel farm-list">
        {o.documents.map((r) => (
          <div className="farm-row" key={r.id}>
            <FileText size={19} />
            <div className="grow">
              <strong>{r.name}</strong>
              <p>
                {r.mime} · {data.fields.find((f) => f.id === r.fieldId)?.name}{" "}
                {o.assets.find((a) => a.id === r.assetId)?.name}
              </p>
            </div>
            <button
              onClick={() => {
                const bytes = Uint8Array.from(atob(r.data.split(",")[1]), (c) =>
                  c.charCodeAt(0),
                );
                downloadFile(
                  attachmentName(r.name, r.mime),
                  bytes,
                  "application/octet-stream",
                );
              }}
            >
              Download
            </button>
            <button
              onClick={async () => {
                if (confirm("Remove this attachment from local farm data?")) {
                  const next = structuredClone(data),
                    x = requireFarm(next);
                  ops(x).documents = ops(x).documents.filter(
                    (a) => a.id !== r.id,
                  );
                  activity(x, "document.removed", r.name, r.id);
                  try {
                    await onSave(next);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
export function Assistant({ data }: { data: Data }) {
  const f = requireFarm(data),
    o = ops(f);
  const [enabled, setEnabled] = useState(false),
    [question, setQuestion] = useState("maintenance");
  const highest = o.journals
    .filter((j) => j.kind === "expense")
    .flatMap((j) => j.postings)
    .filter((p) => p.assetId && p.cents > 0);
  const costs = o.assets
    .map((a) => ({
      name: a.name,
      cents: highest
        .filter((p) => p.assetId === a.id)
        .reduce((n, p) => n + p.cents, 0),
    }))
    .sort((a, b) => b.cents - a.cents);
  const overdue = o.maintenance.filter((m) => {
    const a = o.assets.find((a) => a.id === m.assetId);
    return a && maintenanceDue(m, a);
  });
  const recent = new Set(
    data.sessions
      .filter(
        (s) =>
          s.start >= Date.now() - 14 * 86400000 &&
          s.status !== "planned" &&
          s.status !== "canceled",
      )
      .map((s) => s.fieldId),
  );
  return (
    <>
      <div className="fieldnote">
        <ShieldCheck />
        <div>
          <h3>Local decision support. No AI service connected.</h3>
          <p>
            These deterministic reports read this browser’s records only. No
            farm data is sent anywhere. They do not modify records or provide
            agronomic/veterinary recommendations.
          </p>
        </div>
      </div>
      <button className="primary" onClick={() => setEnabled(!enabled)}>
        {enabled ? "Close local insights" : "Open local insights"}
      </button>
      {enabled && (
        <div className="panel form">
          <label>
            Question
            <select
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            >
              <option value="maintenance">What maintenance is due?</option>
              <option value="cost">
                Which equipment has the most recorded expenses?
              </option>
              <option value="irrigation">
                Which fields have no recorded irrigation in the last two weeks?
              </option>
              <option value="stock">Which inventory is low?</option>
              <option value="forecast">
                When might inventory run out at recorded usage?
              </option>
            </select>
          </label>
          <div aria-live="polite">
            {question === "maintenance" ? (
              overdue.length ? (
                overdue.map((m) => (
                  <p key={m.id}>
                    {m.title} · {o.assets.find((a) => a.id === m.assetId)?.name}
                  </p>
                ))
              ) : (
                <p>No due maintenance in recorded data.</p>
              )
            ) : question === "cost" ? (
              costs.length ? (
                costs.map((a) => (
                  <p key={a.name}>
                    {a.name}: {dollars(a.cents)} original recorded expenses
                  </p>
                ))
              ) : (
                <p>No equipment expenses recorded.</p>
              )
            ) : question === "irrigation" ? (
              data.fields
                .filter((field) => !field.archived && !recent.has(field.id))
                .map((field) => <p key={field.id}>{field.name}</p>)
            ) : (
              o.items
                .filter((i) => stockSummary(f, i.id).low)
                .map((i) => (
                  <p key={i.id}>
                    {i.name} · at or below {i.lowStock} {i.unit}
                  </p>
                ))
            )}
          </div>
          <p className="notice">
            Source: local maintenance, journal, irrigation and inventory
            records. Missing records can change the answer.
          </p>
        </div>
      )}
      {enabled && (
        <div className="panel compact">
          <h3>Recorded-use inventory outlook</h3>
          {o.items.map((item) => {
            const r = inventoryForecast(data, item.id);
            return (
              <p key={item.id}>
                {item.name}: {r.remaining} {item.unit} on hand ·{" "}
                {r.estimatedDaysRemaining === null
                  ? "No recorded consumption rate"
                  : r.estimatedDaysRemaining.toFixed(1) +
                    " days at the last-30-day recorded rate"}
                .
              </p>
            );
          })}
          <p className="notice">
            Assumption: recorded feed, application and loss withdrawals over 30
            days divided by 30. Missing usage is unknown. This is a projection,
            not an actual stock count or feeding recommendation.
          </p>
        </div>
      )}
      <h2>Optional integration boundaries</h2>
      <p className="notice">
        External AI, weather, telematics, scales, RFID, sensors and accounting
        connectors are not enabled. A future connector must declare
        destinations, authorized data scopes, cost limits and read/write
        capabilities. External data sharing requires informed opt-in; any
        proposed record change requires preview and explicit confirmation. No
        API key or personal account is needed for local insights.
      </p>
    </>
  );
}
