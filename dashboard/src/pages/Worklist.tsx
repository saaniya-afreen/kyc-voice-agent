import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Phone } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TRow } from "@/components/ui/table";
import { RiskBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import type { Customer } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const DUE_WINDOWS = [
  { value: "all", label: "Any time" },
  { value: "30", label: "Next 30 days" },
  { value: "60", label: "Next 60 days" },
  { value: "90", label: "Next 90 days" },
];

export default function Worklist() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dueWindow, setDueWindow] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (riskFilter !== "all") params.set("risk_tier", riskFilter);
    if (statusFilter !== "all") params.set("kyc_status", statusFilter);
    if (dueWindow !== "all") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + Number(dueWindow));
      params.set("due_before", cutoff.toISOString().split("T")[0]);
    }
    const data = await api.get<Customer[]>(`/v1/customers?${params.toString()}`);
    setRows(data);
    setLoading(false);
  }, [riskFilter, statusFilter, dueWindow]);

  useEffect(() => {
    load();
  }, [load]);

  async function triggerCall(customerId: string) {
    setDispatching(customerId);
    try {
      await api.post("/v1/trigger-outbound-call", { customer_id: customerId });
      await load();
    } catch (err) {
      alert(`Could not start the call: ${err instanceof ApiError ? err.message : "unknown error"}`);
    } finally {
      setDispatching(null);
    }
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
            {rows.map((customer) => {
              const refresh = customer.latest_refresh;
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
