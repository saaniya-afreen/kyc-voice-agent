import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, User } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, RiskBadge, StatusBadge } from "@/components/ui/badge";
import { OUTCOME_LABELS, type CustomerDetail as CustomerDetailType } from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

export default function CustomerDetail() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetailType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<CustomerDetailType>(`/v1/customers/${customerId}`)
      .then((data) => {
        if (!cancelled) setCustomer(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (loading || !customer) {
    return <p className="text-sm text-muted-foreground">Loading customer…</p>;
  }

  const { refreshes, tins, audit_logs: logs } = customer;

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => navigate(-1)} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{customer.full_name}</h1>
          <p className="text-sm text-muted-foreground">{customer.phone_e164} · {customer.email ?? "no email on file"}</p>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge tier={customer.risk_tier} />
          <StatusBadge status={customer.kyc_status} />
          {customer.activity_status === "dormant" && <Badge variant="muted">Dormant</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Account" value={`•••• ${customer.account_number.slice(-4)}`} />
            <Field label="Date of birth" value={formatDate(customer.date_of_birth)} />
            <Field label="Employer" value={customer.employer} />
            <Field label="Occupation" value={customer.occupation} />
            <Field label="Address" value={customer.address} full />
            <Field label="Next review" value={formatDate(customer.next_review_date)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Declared tax residencies (latest cycle)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {tins.length === 0 && <p className="text-sm text-muted-foreground">No foreign tax residencies on file.</p>}
            {tins.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span className="font-medium">{t.country_code}</span>
                {t.is_available ? <Badge variant="success">TIN on file</Badge> : <Badge variant="warning">Reason {t.reason_code}</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Refresh cycle history</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {refreshes.length === 0 && <p className="text-sm text-muted-foreground">No refresh cycles yet.</p>}
            {refreshes.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{r.outcome_code ? OUTCOME_LABELS[r.outcome_code] ?? r.outcome_code : "In progress"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                </div>
                <StatusBadge status={r.call_status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-4">
            {logs.length === 0 && <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>}
            {logs.map((log) => (
              <li key={log.id} className="flex gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    log.actor === "voice_agent" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {log.actor === "voice_agent" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{log.event_type.replace(/_/g, " ")}</p>
                    <span className="text-xs text-muted-foreground">by {log.actor}</span>
                    <span className="text-xs text-muted-foreground">· {formatDateTime(log.created_at)}</span>
                  </div>
                  {(log.old_data || log.new_data) && (
                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      {log.old_data && (
                        <div>
                          <span className="font-medium">Before: </span>
                          {JSON.stringify(log.old_data)}
                        </div>
                      )}
                      {log.new_data && (
                        <div>
                          <span className="font-medium">After: </span>
                          {JSON.stringify(log.new_data)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
