"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_OPTIONS } from "@/components/admin-access/access-fields";
import { apiGet } from "@/lib/apiClient";

type Profile = { roles: string[]; outlets: string[]; email: string | null; name: string };
type Outlet = { location_key: string; name?: string };

/** What this account can do and where, read from the server so it is current even if it changed after sign-in. */
export function MyAccess() {
  const [open, setOpen] = useState(false);
  const profile = useQuery({
    queryKey: ["my-access"],
    queryFn: () => apiGet<{ profile: Profile }>("/me", true),
    select: (data) => data?.profile,
    enabled: open,
    staleTime: 0,
  });
  const outlets = useQuery({
    queryKey: ["outlets"],
    queryFn: () => apiGet<{ outlets: Outlet[] }>("/public/outlets"),
    select: (data) => (Array.isArray(data?.outlets) ? data.outlets : []),
    enabled: open,
  });

  const data = profile.data;
  const allBranches = data?.outlets.includes("all");
  const branchNames = (data?.outlets ?? []).map((key) => outlets.data?.find((o) => o.location_key === key)?.name ?? key);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpen(true)}>
        <ShieldCheck className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
        My access
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>My access</DialogTitle>
            <DialogDescription>{data ? `${data.name}${data.email ? ` · ${data.email}` : ""}` : "What this account can do."}</DialogDescription>
          </DialogHeader>
          {profile.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : profile.isError || !data ? (
            <p role="alert" className="text-sm text-destructive">Your access could not be loaded.</p>
          ) : (
            <div className="space-y-5 text-sm">
              <section>
                <h3 className="eyebrow">What you can do</h3>
                {data.roles.length === 0 ? (
                  <p className="mt-2 text-muted-foreground">No staff access has been given to this account.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {data.roles.map((role) => {
                      const option = ROLE_OPTIONS.find((o) => o.value === role);
                      return (
                        <li key={role}>
                          <p className="font-medium">{option?.label ?? role}</p>
                          {option ? <p className="text-xs text-muted-foreground">{option.hint}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              {data.roles.length > 0 ? (
                <section>
                  <h3 className="eyebrow">Branches</h3>
                  {allBranches ? (
                    <p className="mt-2">All branches</p>
                  ) : branchNames.length === 0 ? (
                    <p className="mt-2 text-muted-foreground">No branches. Ask an administrator to give you one.</p>
                  ) : (
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {branchNames.map((name) => <li key={name}>{name}</li>)}
                    </ul>
                  )}
                </section>
              ) : null}
              <p className="text-xs text-muted-foreground">Changes made by an administrator apply the next time you open a page.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
