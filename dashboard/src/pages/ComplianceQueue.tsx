import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TRow } from "@/components/ui/table";
import { RiskBadge, StatusBadge, Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { OUTCOME_LABELS, type ComplianceCase } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default function ComplianceQueue() {
  const [cases, setCases] = useState<ComplianceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending_review");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let query = supabase
        .from("compliance_cases")
        .select("*, customer:customers(*), kyc_refresh:kyc_refresh(*)")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("case_status", statusFilter);
      const { data } = await query.limit(200);
      if (!cancelled) {
        setCases((data as ComplianceCase[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Compliance Queue</h1>
        <p className="text-sm text-muted-foreground">Escalated cases awaiting officer sign-off.</p>
      </div>

      <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-56">
        <option value="pending_review">Pending review</option>
        <option value="in_review">In review</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="all">All cases</option>
      </Select>

      <Card className="p-0">
        <Table>
          <THead>
            <TRow>
              <TH>Customer</TH>
              <TH>Reason</TH>
              <TH>Flow</TH>
              <TH>Risk</TH>
              <TH>Opened</TH>
              <TH>Status</TH>
            </TRow>
          </THead>
          <TBody>
            {loading && (
              <TRow>
                <TD colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </TD>
              </TRow>
            )}
            {!loading && cases.length === 0 && (
              <TRow>
                <TD colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No cases in this state.
                </TD>
              </TRow>
            )}
            {cases.map((c) => (
              <TRow key={c.id} className="cursor-pointer">
                <TD>
                  <Link to={`/compliance/${c.id}`} className="font-medium hover:underline">
                    {c.customer?.full_name ?? "Unknown"}
                  </Link>
                </TD>
                <TD className="max-w-xs truncate text-sm text-muted-foreground" title={c.escalation_reason}>
                  {c.escalation_reason}
                </TD>
                <TD>
                  {c.kyc_refresh?.outcome_code ? (
                    <Badge variant="outline">{OUTCOME_LABELS[c.kyc_refresh.outcome_code] ?? c.kyc_refresh.outcome_code}</Badge>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>{c.customer && <RiskBadge tier={c.customer.risk_tier} />}</TD>
                <TD className="text-sm">{formatDateTime(c.created_at)}</TD>
                <TD>
                  <StatusBadge status={c.case_status} />
                </TD>
              </TRow>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
