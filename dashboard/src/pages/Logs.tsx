import { useEffect, useRef, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  tookMs: number;
  body: unknown;
}

function statusVariant(status: number): "success" | "warning" | "destructive" | "muted" {
  if (status >= 500) return "destructive";
  if (status >= 400) return "warning";
  if (status >= 200 && status < 300) return "success";
  return "muted";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AE", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Logs() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [live, setLive] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  async function load() {
    const data = await api.get<LogEntry[]>("/v1/logs");
    setEntries(data);
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (liveRef.current) load();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">API Logs</h1>
          <p className="text-sm text-muted-foreground">
            Live requests hitting the API — method, path, status, timing, and body. Most recent first. Kept in memory, so this resets on
            every API restart/deploy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLive((v) => !v)}>
            {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {live ? "Pause" : "Resume"} live
          </Button>
        </div>
      </div>

      <Card className="p-0">
        <Table>
          <THead>
            <TRow>
              <TH>Time</TH>
              <TH>Method</TH>
              <TH>Path</TH>
              <TH>Status</TH>
              <TH>Took</TH>
              <TH>Body</TH>
            </TRow>
          </THead>
          <TBody>
            {entries.length === 0 && (
              <TRow>
                <TD colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No requests recorded yet — place a test call or hit an endpoint.
                </TD>
              </TRow>
            )}
            {entries.map((entry) => {
              const bodyStr = JSON.stringify(entry.body);
              const expanded = expandedId === entry.id;
              return (
                <TRow key={entry.id}>
                  <TD className="whitespace-nowrap font-mono text-xs">{formatTime(entry.timestamp)}</TD>
                  <TD className="font-mono text-xs">{entry.method}</TD>
                  <TD className="font-mono text-xs">{entry.path}</TD>
                  <TD>
                    <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{entry.tookMs}ms</TD>
                  <TD
                    className={cn("max-w-md cursor-pointer font-mono text-xs text-muted-foreground", expanded ? "whitespace-pre-wrap break-all" : "truncate")}
                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                    title={expanded ? "Click to collapse" : "Click to expand"}
                  >
                    {bodyStr}
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
