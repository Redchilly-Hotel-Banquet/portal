"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Info, KeyRound, Loader2, Plus, Search, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminOutlets } from "@/hooks/useAdminAccess";
import { apiPost } from "@/lib/apiClient";
import { AccountInfoSheet, type InfoTarget } from "./account-info-sheet";
import { AccessFields, ROLE_OPTIONS, type BranchOption } from "./access-fields";

type Account = { id: string; email: string; name: string; picture: string | null; roles: string[]; outlets: string[]; isActive: boolean };
type GuestHit = { key: string; name: string; phone: string; email: string; bookings: number };
type Login = { id: string; name: string; roles: string[]; outlets: string[]; isActive: boolean; hasPassword: boolean; passwordUpdatedAt: string | null };

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const roleLabel = (value: string) => ROLE_OPTIONS.find((role) => role.value === value)?.label ?? value;

function useBranches(): BranchOption[] {
  const query = useQuery({
    queryKey: ["access-branches"],
    queryFn: () => apiPost<{ outlets: Array<{ location_key?: string; name?: string }> }>("/admin/outlets/manage", { action: "list" }, true),
  });
  return (query.data?.outlets ?? [])
    .filter((outlet) => outlet.location_key)
    .map((outlet) => ({ location_key: outlet.location_key as string, name: outlet.name || (outlet.location_key as string) }));
}

const Summary = ({ roles, outlets, branches }: { roles: string[]; outlets: string[]; branches: BranchOption[] }) => (
  <span className="flex flex-wrap items-center gap-1.5">
    {roles.length === 0 ? <span className="text-xs text-muted-foreground">No staff access</span> : roles.map((role) => <Badge key={role} variant="secondary">{roleLabel(role)}</Badge>)}
    {roles.length > 0 ? (
      <span className="text-xs text-muted-foreground">
        {outlets.includes("all") ? "All branches" : outlets.map((key) => branches.find((branch) => branch.location_key === key)?.name ?? key).join(", ")}
      </span>
    ) : null}
  </span>
);

/* ------------------------------ Google accounts ------------------------------ */

function AccountsTab({ branches }: { branches: BranchOption[] }) {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Account | null>(null);
  const [viewing, setViewing] = useState<InfoTarget | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [outlets, setOutlets] = useState<string[]>([]);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(term.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const results = useQuery({
    queryKey: ["access-users", q],
    queryFn: () => apiPost<{ users: Account[]; guests: GuestHit[]; more: boolean; staffOnly: boolean }>("/admin/access", { action: "users_search", q }, true),
  });
  const searching = q.length >= 2;

  const open = (account: Account) => {
    setEditing(account);
    setRoles(account.roles);
    setOutlets(account.outlets);
    setActive(account.isActive);
  };

  const save = useMutation({
    mutationFn: () => apiPost("/admin/access", { action: "user_update", id: editing?.id, roles, outlets, isActive: active }, true),
    onSuccess: () => {
      toast.success("Access updated");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["access-users"] });
    },
    onError: (error) => toast.error(messageOf(error, "Could not save")),
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <Input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by name, phone or email" aria-label="Search accounts and guests" className="pl-9" />
      </div>
      <p className="text-xs text-muted-foreground">
        {searching
          ? "Search results. Info shows how a person has used the hotel; Manage access sets their roles and branches. People who have only booked, without signing in, are listed separately."
          : "People who already have access are listed below. To find anyone else, type at least two letters of their name or email, or part of a phone number."}
      </p>
      {!searching ? <h2 className="eyebrow">People with access</h2> : null}

      {results.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : results.isError ? (
        <p role="alert" className="text-sm text-destructive">{messageOf(results.error, "Could not search")}</p>
      ) : (results.data?.users.length ?? 0) === 0 && (results.data?.guests.length ?? 0) === 0 ? (
        <EmptyState icon={UserCog} title={searching ? "No accounts found" : "No one has access yet"} description={searching ? "Try another name or email." : "Search for a person to give them access."} />
      ) : (
        <>
        <ul className="divide-y rounded-md border bg-card">
          {results.data!.users.map((account) => (
            <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{account.name || account.email}</span>
                <span className="block truncate text-xs text-muted-foreground">{account.email}{account.isActive ? "" : " · Deactivated"}</span>
                <span className="mt-1 block"><Summary roles={account.roles} outlets={account.outlets} branches={branches} /></span>
              </span>
              <span className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setViewing({ kind: "account", id: account.id, name: account.name, email: account.email })}>
                  <Info className="mr-1.5 h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Info
                </Button>
                <Button size="sm" variant="outline" onClick={() => open(account)}>Manage access</Button>
              </span>
            </li>
          ))}
        </ul>
        {results.data?.more ? <p className="text-xs text-muted-foreground">Showing the first 25. Type more of the name or email to narrow it down.</p> : null}
        </>
      )}

      {searching && (results.data?.guests.length ?? 0) > 0 ? (
        <section className="space-y-2">
          <h2 className="eyebrow">Guests without a Google account</h2>
          <p className="text-xs text-muted-foreground">Found on their bookings by name, phone or email. They cannot be given access until they sign in with Google.</p>
          <ul className="divide-y rounded-md border bg-card">
            {results.data!.guests.map((guest) => (
              <li key={guest.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{guest.name || "Guest"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[guest.phone, guest.email].filter(Boolean).join(" · ") || "No contact on file"} · {guest.bookings} booking{guest.bookings === 1 ? "" : "s"}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setViewing({ kind: "guest", key: guest.key, name: guest.name, email: guest.email, phone: guest.phone })}>
                  <Info className="mr-1.5 h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Info
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AccountInfoSheet account={viewing} onClose={() => setViewing(null)} />

      <Sheet open={editing !== null} onOpenChange={(next) => !save.isPending && !next && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="text-left">
            <SheetTitle>{editing?.name || editing?.email}</SheetTitle>
            <SheetDescription>{editing?.email}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <AccessFields idPrefix="acct" roles={roles} outlets={outlets} branches={branches} disabled={save.isPending} onRoles={setRoles} onOutlets={setOutlets} />
            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div>
                <Label htmlFor="acct-active">Account active</Label>
                <p className="text-xs text-muted-foreground">A deactivated account cannot sign in at all.</p>
              </div>
              <Switch id="acct-active" checked={active} onCheckedChange={setActive} disabled={save.isPending} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={save.isPending}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Save access
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ------------------------------- Staff logins -------------------------------- */

type LoginDraft = { id: string | null; name: string; password: string; roles: string[]; outlets: string[]; isActive: boolean };
const blankLogin: LoginDraft = { id: null, name: "", password: "", roles: [], outlets: [], isActive: true };

function LoginsTab({ branches }: { branches: BranchOption[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LoginDraft | null>(null);

  const logins = useQuery({
    queryKey: ["access-logins"],
    queryFn: () => apiPost<{ logins: Login[] }>("/admin/access", { action: "logins_list" }, true),
  });

  const save = useMutation({
    mutationFn: (value: LoginDraft) =>
      apiPost(
        "/admin/access",
        value.id
          ? { action: "login_update", id: value.id, name: value.name, roles: value.roles, outlets: value.outlets, isActive: value.isActive, password: value.password }
          : { action: "login_create", name: value.name, password: value.password, roles: value.roles, outlets: value.outlets },
        true,
      ),
    onSuccess: () => {
      toast.success("Login saved");
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["access-logins"] });
    },
    onError: (error) => toast.error(messageOf(error, "Could not save")),
  });

  const [shown, setShown] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<Login | null>(null);

  const reveal = useMutation({
    mutationFn: (id: string) => apiPost<{ password: string }>("/admin/access", { action: "login_reveal", id }, true),
    onSuccess: (data, id) => setShown((prev) => ({ ...prev, [id]: data.password })),
    onError: (error) => toast.error(messageOf(error, "Could not show the password")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiPost("/admin/access", { action: "login_delete", id }, true),
    onSuccess: () => {
      toast.success("Login deleted");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["access-logins"] });
    },
    onError: (error) => toast.error(messageOf(error, "Could not delete the login")),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy. Select the password and copy it.");
    }
  };

  const edit = (login: Login) =>
    setDraft({ id: login.id, name: login.name, password: "", roles: login.roles, outlets: login.outlets, isActive: login.isActive });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Usernames and passwords for staff who sign in on the staff portal. Passwords are stored encrypted. Show one only when you need it; each time is recorded.
        </p>
        <Button onClick={() => setDraft({ ...blankLogin })}>
          <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
          New login
        </Button>
      </div>

      {logins.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : logins.isError ? (
        <p role="alert" className="text-sm text-destructive">{messageOf(logins.error, "Could not load the logins")}</p>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {(logins.data?.logins ?? []).map((login) => (
            <li key={login.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  <KeyRound className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                  {login.name}
                  {login.isActive ? null : <Badge variant="outline">Deactivated</Badge>}
                </span>
                <span className="mt-1 block"><Summary roles={login.roles} outlets={login.outlets} branches={branches} /></span>
                {!login.hasPassword ? <span className="block text-xs text-muted-foreground">No password of its own; the default password applies.</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {shown[login.id] !== undefined ? (
                  <>
                    <code className="rounded-sm border bg-muted px-2 py-1 font-mono text-sm">{shown[login.id]}</code>
                    <Button size="sm" variant="ghost" onClick={() => void copy(shown[login.id])}>Copy</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShown(({ [login.id]: _hidden, ...rest }) => rest)}>Hide</Button>
                  </>
                ) : login.hasPassword ? (
                  <Button size="sm" variant="ghost" onClick={() => reveal.mutate(login.id)} disabled={reveal.isPending && reveal.variables === login.id}>
                    <Eye className="mr-1.5 h-4 w-4" strokeWidth={1.75} aria-hidden />
                    Show password
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => edit(login)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(login)} aria-label={`Delete login ${login.name}`}>
                  <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete the login "${deleting.name}"?` : "Delete login?"}
        description="It is removed for good and the person is signed out at once. This cannot be undone. Deactivate it instead if you may need it again."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />

      <Sheet open={draft !== null} onOpenChange={(next) => !save.isPending && !next && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {draft ? (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{draft.id ? "Edit login" : "New login"}</SheetTitle>
                <SheetDescription>{draft.id ? "Leave the password empty to keep it." : "Choose a username and a password of at least 8 characters."}</SheetDescription>
              </SheetHeader>
              <form
                className="mt-6 space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  save.mutate(draft);
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="login-name">Username</Label>
                  <Input id="login-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoComplete="off" required minLength={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password">{draft.id ? "New password" : "Password"}</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={draft.password}
                    onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                    autoComplete="new-password"
                    minLength={8}
                    required={!draft.id}
                    placeholder={draft.id ? "Leave empty to keep the current one" : undefined}
                  />
                </div>
                <AccessFields idPrefix="login" roles={draft.roles} outlets={draft.outlets} branches={branches} disabled={save.isPending} onRoles={(roles) => setDraft({ ...draft, roles })} onOutlets={(outlets) => setDraft({ ...draft, outlets })} />
                {draft.id ? (
                  <div className="flex items-center justify-between rounded-md border px-4 py-3">
                    <div>
                      <Label htmlFor="login-active">Login active</Label>
                      <p className="text-xs text-muted-foreground">A deactivated login is signed out at once.</p>
                    </div>
                    <Switch id="login-active" checked={draft.isActive} onCheckedChange={(isActive) => setDraft({ ...draft, isActive })} disabled={save.isPending} />
                  </div>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>Cancel</Button>
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                    {draft.id ? "Save changes" : "Create login"}
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function AccessManager() {
  const branches = useBranches();
  // Only administrators who can see every branch manage access; the server enforces the same.
  const allBranches = getAdminOutlets().some((key) => key.trim().toLowerCase() === "all");
  return (
    <AdminShell scope="admin" title="Access" description="Who can sign in, what they can do and which branches they can work in.">
      {!allBranches ? (
        <EmptyState icon={UserCog} title="Not available for your account" description="Only an administrator with access to every branch can manage access." />
      ) : (
        <Tabs defaultValue="accounts" className="space-y-5">
          <TabsList>
            <TabsTrigger value="accounts">Google accounts</TabsTrigger>
            <TabsTrigger value="logins">Staff logins</TabsTrigger>
          </TabsList>
          <TabsContent value="accounts" className="mt-0"><AccountsTab branches={branches} /></TabsContent>
          <TabsContent value="logins" className="mt-0"><LoginsTab branches={branches} /></TabsContent>
        </Tabs>
      )}
    </AdminShell>
  );
}
