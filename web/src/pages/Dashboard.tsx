import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, ErrorBox, Spinner } from "../components/ui";
import { navigate } from "../router";

type Kpi = { label: string; value: number; unit: string; basis: string };

export function Dashboard() {
  const [data, setData] = useState<Record<string, Kpi> | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<{ kpis: Record<string, Kpi> }>("/dashboard/kpis").then((r) => setData(r.kpis)).catch(setError);
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;

  return (
    <>
      <p className="muted">KPIはサーバ側で実データから算出しています。各カードの根拠（母数・締め時点）は説明文に表示されます。</p>
      <div className="kpi-grid">
        {Object.entries(data).map(([key, kpi]) => (
          <Card key={key}>
            <p className="kpi-label">{kpi.label}</p>
            <p className="kpi-value">
              {kpi.value}
              <span>{kpi.unit}</span>
            </p>
            <p className="muted small">{kpi.basis}</p>
          </Card>
        ))}
      </div>
      <div className="actions-row">
        <button type="button" className="btn" onClick={() => navigate("/agenda-items")}>
          議案一覧へ
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => navigate("/audit")}>
          監査ワークベンチへ
        </button>
      </div>
    </>
  );
}
