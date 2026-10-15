import React, { useState } from "react";
import type { ApiClient } from "./sync";
import { dollars } from "./operations";
export function ServerReports({
  api,
  organizationId,
  financial,
}: {
  api: ApiClient;
  organizationId: string;
  financial: boolean;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [error, setError] = useState("");
  return (
    <div>
      <button
        onClick={async () => {
          try {
            const result = await api.request(
              "/organizations/" +
                organizationId +
                (financial ? "/reports/financial" : "/records/fields"),
            );
            setRows(financial ? result.reports : result.records);
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {financial
          ? "Load authorized financial report"
          : "Load permitted field report"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {rows.map((r, i) => (
        <div className="farm-row" key={String(r.id ?? i)}>
          <strong>{String(r.enterprise ?? r.name ?? "Record")}</strong>
          <p>
            {financial
              ? `Production inputs ${dollars(Number(r.productionCents))} · External revenue ${dollars(Number(r.revenueCents))} · Operating margin ${dollars(Number(r.operatingMarginCents))}`
              : `${String(r.acreage ?? 0)} acres · ${String(r.crop ?? "")}`}
          </p>
        </div>
      ))}
      <p className="notice">
        This view receives only the datasets authorized by the server. It does
        not import the owner’s full farm into this browser.
      </p>
    </div>
  );
}
