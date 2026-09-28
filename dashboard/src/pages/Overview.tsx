import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge } from "@/components/ui/badge";
import type { ComplianceCase } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Kpis {
  totalUniverse: number;
  dueForReview: number;
  inProgress: number;
  autoCompleted: number;
  pendingReview: number;
}

interface FunnelStage {
  stage: string;
  count: number;
}

async function count(table: string, filters: (q: any) => any): Promise<number> {
  const { count: n } = await filters(supabase.from(table).select("*", { count: "exact", head: true }));
  return n ?? 0;
}

export default function Overview() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [exceptions, setExceptions] = useState<ComplianceCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [
        totalUniverse,
        dueForReview,
        inProgress,
        autoCompleted,
        pendingReview,
        contacted,
        authenticated,
        completed,
        escalated,
        { data: exceptionRows },
      ] = await Promise.all([
        count("customers", (q) => q),
        count("customers", (q) => q.eq("kyc_status", "due")),
        count("kyc_refresh", (q) => q.eq("call_status", "calling")),
        count("kyc_refresh", (q) => q.in("outcome_code", ["UC-1.1", "UC-1.2", "UC-1.3"])),
        count("compliance_cases", (q) => q.eq("case_status", "pending_review")),
        count("kyc_refresh", (q) => q.gt("contact_attempts", 0)),
        count("kyc_refresh", (q) => q.gt("auth_attempts", 0)),
        count("kyc_refresh", (q) => q.eq("call_status", "completed")),
        count("kyc_refresh", (q) => q.eq("call_status", "escalated")),
        supabase
          .from("compliance_cases")
          .select("*, customer:customers(*)")
          .eq("case_status", "pending_review")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (cancelled) return;

      setKpis({ totalUniverse, dueForReview, inProgress, autoCompleted, pendingReview });
      setFunnel([
        { stage: "Due", count: dueForReview },
        { stage: "Contacted", count: contacted },
        { stage: "Authenticated", count: authenticated },
        { stage: "Completed", count: completed },
        { stage: "Escalated", count: escalated },
      ]);
      setExceptions((exceptionRows as ComplianceCase[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !kpis) {
    return <p className="text-sm text-muted-foreground">Loading overview…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Live snapshot of the automated KYC refresh program.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Kpi label="Total universe" value={kpis.totalUniverse} />
        <Kpi label="Due for review" value={kpis.dueForReview} />
        <Kpi label="In progress" value={kpis.inProgress} />
        <Kpi label="Auto-completed (STP)" value={kpis.autoCompleted} tone="success" />
        <Kpi label="Pending officer review" value={kpis.pendingReview} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>KYC funnel</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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
          {exceptions.length === 0 && <p className="p-4 text-sm text-muted-foreground">No cases waiting on review.</p>}
          {exceptions.map((c) => (
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
