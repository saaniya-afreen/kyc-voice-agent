import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Phone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TRow } from "@/components/ui/table";
import { RiskBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import type { Customer, KycRefresh } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface Row {
  customer: Customer;
  refresh: KycRefresh | null;
}

const DUE_WINDOWS = [
  { value: "all", label: "Any time" },
  { value: "30", label: "Next 30 days" },
  { value: "60", label: "Next 60 days" },
  { value: "90", label: "Next 90 days" },
];

export default function Worklist() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dueWindow, setDueWindow] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("customers").select("*").order("next_review_date", { ascending: true });
    if (riskFilter !== "all") query = query.eq("risk_tier", riskFilter);
    if (statusFilter !== "all") query = query.eq("kyc_status", statusFilter);
    if (dueWindow !== "all") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + Number(dueWindow));
      query = query.lte("next_review_date", cutoff.toISOString().split("T")[0]);
    }

    const { data: customers } = await query.limit(200);
    const custList = (customers as Customer[]) ?? [];

    let refreshByCustomer = new Map<string, KycRefresh>();
    if (custList.length > 0) {
      const { data: refreshes } = await supabase
        .from("kyc_refresh")
        .select("*")
        .in("customer_id", custList.map((c) => c.id))
        .order("created_at", { ascending: false });
      for (const r of (refreshes as KycRefresh[]) ?? []) {
        if (!refreshByCustomer.has(r.customer_id)) refreshByCustomer.set(r.customer_id, r);
      }
    }

    setRows(custList.map((customer) => ({ customer, refresh: refreshByCustomer.get(customer.id) ?? null })));
    setLoading(false);
  }, [riskFilter, statusFilter, dueWindow]);

  useEffect(() => {
    load();
  }, [load]);

  async function triggerCall(customerId: string) {
    setDispatching(customerId);
    const { error } = await supabase.functions.invoke("trigger-outbound-call", { body: { customer_id: customerId } });
    setDispatching(null);
    if (error) {
      alert(`Could not start the call: ${error.message}`);
      return;
    }
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">KYC Refresh Worklist</h1>
        <p className="text-sm text-muted-foreground">Customers scheduled for periodic review, ordered by due date.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
          <option value="all">All risk tiers</option>
          <option value="low">Low risk</option>
          <option value="medium">Medium risk</option>
          <option value="high">High risk</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All review statuses</option>
          <option value="due">Due</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="escalated">Escalated</option>
          <option value="current">Current</option>
        </Select>
        <Select value={dueWindow} onChange={(e) => setDueWindow(e.target.value)}>
          {DUE_WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </Select>
      </div>

      <Card className="p-0">
        <Table>
          <THead>
            <TRow>
              <TH>Customer</TH>
              <TH>Risk tier</TH>
              <TH>Next review</TH>
              <TH>Attempts</TH>
              <TH>Call status</TH>
              <TH className="text-right">Action</TH>
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
            {!loading && rows.length === 0 && (
              <TRow>
                <TD colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No customers match these filters.
                </TD>
              </TRow>
            )}
            {rows.map(({ customer, refresh }) => {
              const attempts = refresh?.contact_attempts ?? 0;
              const maxAttempts = refresh?.max_attempts ?? 3;
              const exhausted = attempts >= maxAttempts && refresh?.call_status !== "completed";
              const calling = refresh?.call_status === "calling";
              return (
                <TRow key={customer.id}>
                  <TD>
                    <Link to={`/customers/${customer.id}`} className="font-medium hover:underline">
                      {customer.full_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{customer.phone_e164}</p>
                  </TD>
                  <TD>
                    <RiskBadge tier={customer.risk_tier} />
                  </TD>
                  <TD className="text-sm">{formatDate(customer.next_review_date)}</TD>
                  <TD className="text-sm tabular-nums">
                    {attempts}/{maxAttempts}
                  </TD>
                  <TD>
                    <StatusBadge status={refresh?.call_status ?? "pending"} />
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={calling || exhausted || dispatching === customer.id || customer.kyc_status === "completed"}
                      onClick={() => triggerCall(customer.id)}
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {dispatching === customer.id ? "Dialing…" : calling ? "In call" : exhausted ? "Attempts used" : "Trigger call"}
                    </Button>
                  </TD>
                </TRow>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
