"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { formatDateTime } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/apiClient";

type Report = {
  id: string;
  kind: string;
  format: "xlsx" | "pdf" | "csv";
  status: "PROCESSING" | "READY" | "FAILED";
  file_name: string;
  size: number | null;
  error: string | null;
  created_at: string;
  created_by_name: string;
};

type Props = { kind: "branches" | "guests" | "trends"; from: string; to: string; outlets: string[] };

const FORMAT_LABEL = { xlsx: "Excel", pdf: "PDF", csv: "CSV" } as const;
const size = (bytes: number | null) => (bytes === null ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const saveFile = (base64: string, contentType: string, fileName: string) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

/** Export the figures for the chosen filters as Excel or PDF. Files are built in the background and kept until deleted. */
export function ReportsPanel({ kind, from, to, outlets }: Props) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<Report | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const key = ["analytics-reports", kind, from, to, outlets];

  const list = useQuery({
    queryKey: key,
    queryFn: () => apiPost<{ reports: Report[] }>("/admin/analytics/reports", { action: "list", kind, from, to, outlets }, true),
    select: (data) => data?.reports ?? [],
    // Poll only while something is still being built.
    refetchInterval: (query) => ((query.state.data as { reports?: Report[] } | undefined)?.reports?.some((r) => r.status === "PROCESSING") ? 3000 : false),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiPost("/admin/analytics/reports", { action: "delete", id }, true),
    onSuccess: () => {
      toast.success("Report deleted");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete the report"),
  });

  const download = async (report: Report) => {
    setDownloading(report.id);
    try {
      const file = await apiPost<{ file_name: string; content_type: string; data: string }>("/admin/analytics/reports", { action: "download", id: report.id }, true);
      if (file) saveFile(file.data, file.content_type, file.file_name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the report");
    } finally {
      setDownloading(null);
    }
  };

  const reports = list.data ?? [];

  return (
    <section data-no-capture className="space-y-4 rounded-md border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">Reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">Reports exported for the period and branches chosen above. Use Export at the top of the page to make one. They are built in the background and kept here until you delete them.</p>
        </div>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading reports</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports yet for these filters.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {reports.map((report) => (
            <li key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{report.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {FORMAT_LABEL[report.format]} · {formatDateTime(report.created_at)}
                  {report.created_by_name ? ` · ${report.created_by_name}` : ""}
                  {report.status === "READY" ? ` · ${size(report.size)}` : ""}
                </p>
                {report.status === "FAILED" ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {report.error ?? "The report could not be generated."}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {report.status === "PROCESSING" ? (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Generating
                  </span>
                ) : null}
                {report.status === "READY" ? (
                  <Button size="sm" variant="outline" disabled={downloading === report.id} onClick={() => void download(report)}>
                    {downloading === report.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Download className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />}
                    Download
                  </Button>
                ) : null}
                <Button size="icon" variant="ghost" aria-label={`Delete ${report.file_name}`} disabled={report.status === "PROCESSING"} onClick={() => setDeleting(report)}>
                  <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this report?"
        description={deleting ? `${deleting.file_name} will be removed from the list and from storage. This cannot be undone.` : undefined}
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </section>
  );
}
