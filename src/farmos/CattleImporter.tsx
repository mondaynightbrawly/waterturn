import React, { useState } from "react";
import type { Data } from "../model";
import { requireFarm } from "./domain";
import { ops, dollars } from "./operations";
import { parseCattleCsv, importCattle } from "./cattle-import";
export function CattleImporter({
  data,
  onSave,
}: {
  data: Data;
  onSave: (d: Data) => Promise<unknown>;
}) {
  const [groupId, setGroupId] = useState(""),
    [preview, setPreview] = useState<ReturnType<typeof parseCattleCsv> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const groups = ops(requireFarm(data)).groups.filter(
    (g) => g.mode === "individual",
  );
  return (
    <details className="panel form">
      <summary>Import cattle CSV</summary>
      <p>
        Optional headers: tag (required), eid, breed, sex, bornOn,
        birthWeightLb, acquisitionCostUSD. New animals and their acquisition
        costs are added atomically after confirmation. Existing animals are
        preserved.
      </p>
      <label>
        Import destination group
        <select
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setPreview(null);
          }}
        >
          <option value="">Choose group</option>
          {groups.map((g) => (
            <option value={g.id} key={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Choose cattle CSV
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={!groupId}
          onChange={async (e) => {
            try {
              const file = e.target.files?.[0];
              if (!file) return;
              const rows = parseCattleCsv(await file.text(), groupId);
              importCattle(data, rows);
              setPreview(rows);
              setError("");
            } catch (err) {
              setPreview(null);
              setError((err as Error).message);
            }
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview && (
        <>
          <h3>Import preview</h3>
          <p>
            {preview.length} animals ·{" "}
            {dollars(preview.reduce((n, r) => n + r.acquisitionCents, 0))}{" "}
            acquisition cost
          </p>
          <p>
            {preview
              .slice(0, 20)
              .map((r) => r.tag)
              .join(", ")}
            {preview.length > 20 ? "…" : ""}
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              if (
                !confirm(
                  "Add these animals and acquisition cost records? Existing data will not be replaced.",
                )
              )
                return;
              setBusy(true);
              try {
                await onSave(importCattle(data, preview));
                setPreview(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm cattle import
          </button>
          <button onClick={() => setPreview(null)}>Cancel import</button>
        </>
      )}
    </details>
  );
}
