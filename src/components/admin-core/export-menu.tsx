"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiPost } from "@/lib/apiClient";

type Props = { kind: "branches" | "guests" | "trends"; from: string; to: string; outlets: string[] };

/** Start an Excel or PDF export of the figures on screen. The file is built in the background and listed under Reports. */
export function ExportMenu({ kind, from, to, outlets }: Props) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (format: "xlsx" | "pdf" | "csv") => apiPost("/admin/analytics/reports", { action: "create", kind, format, from, to, outlets }, true),
    onSuccess: () => {
      toast.success("Report started. It will appear in the Reports tab when it is ready.");
      void queryClient.invalidateQueries({ queryKey: ["analytics-reports"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not start the report"),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={create.isPending}>
          <FileDown className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => create.mutate("xlsx")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => create.mutate("pdf")}>
          <FileText className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => create.mutate("csv")}>
          <FileText className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden /> CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
