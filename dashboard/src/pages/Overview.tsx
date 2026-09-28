import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge } from "@/components/ui/badge";
import type { ComplianceCase } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface OverviewResponse {
  kpis: {
    totalUniverse: number;
    dueForReview: number;
    inProgress: number;
    autoCompleted: number;
    pendingReview: number;
  };
  funnel: { stage: string; count: number }[];
  pending_cases: ComplianceCase[];
}

export default function Overview() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<OverviewResponse>("/v1/overview")
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !data) {
    return <p className="text-sm text-muted-foreground">Loading overview…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Live snapshot of the automated KYC refresh program.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Kpi label="Total universe" value={data.kpis.totalUniverse} />
        <Kpi label="Due for review" value={data.kpis.dueForReview} />
        <Kpi label="In progress" value={data.kpis.inProgress} />
        <Kpi label="Auto-completed (STP)" value={data.kpis.autoCompleted} tone="success" />
        <Kpi label="Pending officer review" value={data.kpis.pendingReview} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>KYC funnel</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.funnel} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="stage" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                cursor={{ fill: "hsl(var(--muted))" }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Pending compliance review</CardTitle>
          <Link to="/compliance" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {data.pending_cases.length === 0 && <p className="p-4 text-sm text-muted-foreground">No cases waiting on review.</p>}
          {data.pending_cases.map((c) => (
            <Link
              key={c.id}
              to={`/compliance/${c.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{c.customer?.full_name ?? "Unknown customer"}</p>
                <p className="truncate text-xs text-muted-foreground">{c.escalation_reason}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {c.customer && <RiskBadge tier={c.customer.risk_tier} />}
                <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={
            "mt-1 text-2xl font-semibold tabular-nums " +
            (tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground")
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
