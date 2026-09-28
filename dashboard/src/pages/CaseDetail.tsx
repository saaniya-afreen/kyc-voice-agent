import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileCheck2, ShieldAlert, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, RiskBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OUTCOME_LABELS, type ComplianceCaseDetail } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { officer } = useAuth();
  const [kase, setKase] = useState<ComplianceCaseDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    const data = await api.get<ComplianceCaseDetail>(`/v1/compliance-cases/${caseId}`);
    setKase(data);
    setNotes(data.officer_notes ?? "");
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function assignToMe() {
    if (!kase) return;
    setSaving(true);
    await api.post(`/v1/compliance-cases/${kase.id}/assign`);
    setSaving(false);
    await load();
  }

  async function approveAndComplete() {
    if (!kase) return;
    setSaving(true);
    await api.post(`/v1/compliance-cases/${kase.id}/approve`, { officer_notes: notes });
    setSaving(false);
    await load();
  }

  async function requestManualOutreach() {
    if (!kase) return;
    setSaving(true);
    await api.post(`/v1/compliance-cases/${kase.id}/manual-outreach`, { officer_notes: notes });
    setSaving(false);
    await load();
  }

  if (loading || !kase) {
    return <p className="text-sm text-muted-foreground">Loading case…</p>;
  }

  const customer = kase.customer;
  const refresh = kase.kyc_refresh;

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => navigate(-1)} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{customer?.full_name ?? "Unknown customer"}</h1>
          <p className="text-sm text-muted-foreground">
            Case opened {formatDateTime(kase.created_at)}
            {customer && (
              <>
                {" · "}
                <Link to={`/customers/${customer.id}`} className="text-primary hover:underline">
                  view full profile & audit trail
                </Link>
              </>
            )}
          </p>
        </div>
        <StatusBadge status={kase.case_status} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left: profile + recording + transcript */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Customer snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Phone" value={customer?.phone_e164} />
              <Field label="Risk tier" value={customer && <RiskBadge tier={customer.risk_tier} />} />
              <Field label="Employer" value={customer?.employer} />
              <Field label="Occupation" value={customer?.occupation} />
              <Field label="Address" value={customer?.address} />
              <Field label="Date of birth" value={customer && formatDate(customer.date_of_birth)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Call recording</CardTitle>
            </CardHeader>
            <CardContent>
              {refresh?.call_recording_url ? (
                <audio controls className="w-full" src={refresh.call_recording_url} />
              ) : (
                <p className="text-sm text-muted-foreground">No recording available for this cycle.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              {refresh?.call_transcript ? (
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs leading-relaxed scrollbar-thin">
                  {refresh.call_transcript}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">No transcript available.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: escalation, TINs, docs, actions */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Escalation
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {refresh?.outcome_code && (
                <Badge variant="warning" className="w-fit">
                  {OUTCOME_LABELS[refresh.outcome_code] ?? refresh.outcome_code}
                </Badge>
              )}
              {kase.material_change_type && (
                <Badge variant="outline" className="w-fit capitalize">
                  Structure change: {kase.material_change_type}
                </Badge>
              )}
              <p className="text-sm text-muted-foreground">{kase.escalation_reason}</p>
            </CardContent>
          </Card>

          {kase.tins.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tax residencies collected</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {kase.tins.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="font-medium">{t.country_code}</span>
                    {t.is_available ? (
                      <Badge variant="success">TIN on file</Badge>
                    ) : (
                      <Badge variant="warning">OECD reason {t.reason_code}</Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {kase.required_documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <FileCheck2 className="h-3.5 w-3.5" /> Required documents
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                {kase.required_documents.map((doc) => (
                  <label key={doc} className="flex items-center gap-2">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-border" />
                    {doc}
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5" /> Officer action
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Assigned to: {kase.assigned_officer_id ? (kase.assigned_officer_id === officer?.id ? "you" : kase.assigned_officer_id) : "unassigned"}
              </p>
              <textarea
                className="min-h-20 w-full rounded-md border border-border bg-card p-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                placeholder="Officer notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={kase.case_status === "approved"}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={assignToMe} disabled={saving}>
                  Assign to me
                </Button>
                <Button size="sm" variant="outline" onClick={requestManualOutreach} disabled={saving || kase.case_status === "approved"}>
                  Request manual outreach
                </Button>
                <Button size="sm" variant="success" onClick={approveAndComplete} disabled={saving || kase.case_status === "approved"}>
                  Approve & complete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? "—"}</p>
    </div>
  );
}
