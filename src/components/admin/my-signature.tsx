"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SignaturePad } from "@/components/admin-bookings/signature-pad";
import { apiPost } from "@/lib/apiClient";

type Reply = { signature: string | null; name: string };
const KEY = ["my-signature"];

/** Each staff member saves their own signature once. It is stamped on the bookings they check in. */
export function MySignature() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: KEY,
    queryFn: () => apiPost<Reply>("/admin/me/signature", { action: "get" }, true),
    enabled: open,
    staleTime: 0,
  });
  useEffect(() => {
    if (open && saved.data) setDraft(saved.data.signature ?? "");
  }, [open, saved.data]);

  const save = useMutation({
    mutationFn: (body: { action: "set"; dataUrl: string } | { action: "clear" }) => apiPost<Reply>("/admin/me/signature", body, true),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(KEY, data);
      toast.success(vars.action === "set" ? "Signature saved" : "Signature removed");
      if (vars.action === "clear") setDraft("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the signature"),
  });

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpen(true)}>
        <PenLine className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
        My signature
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>My signature</DialogTitle>
            <DialogDescription>Draw it once. It prints as the hotel's signature on the invoice and bill of every guest you check in.</DialogDescription>
          </DialogHeader>
          {saved.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <>
              <SignaturePad value={draft} savedValue={saved.data?.signature ?? undefined} hint="Sign here with your finger, stylus or mouse." onChange={setDraft} />
              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" disabled={!saved.data?.signature || save.isPending} onClick={() => save.mutate({ action: "clear" })}>
                  Remove saved signature
                </Button>
                <Button type="button" disabled={!draft || draft === saved.data?.signature || save.isPending} onClick={() => save.mutate({ action: "set", dataUrl: draft })}>
                  {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save signature
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
