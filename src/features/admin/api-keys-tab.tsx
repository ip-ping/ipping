"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, type Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";

import { CopyBlock, SecretDialog } from "./secret-dialog";

type Key = Schemas["ApiKeyOut"];
type Created = Schemas["ApiKeyCreated"];

function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "never";
}

export function ApiKeysTab() {
  const { data, reload } = useApiData<Key[]>("/admin/api-keys", 15_000);
  const [editing, setEditing] = useState<Key | "new" | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const revoke = async (key: Key) => {
    if (!window.confirm(`Revoke the key “${key.name}”? Scripts that use it stop working at once.`)) return;
    try {
      await api("DELETE", `/admin/api-keys/${key.id}`);
      toast.success("Revoked");
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const secret = created?.key ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          An API key lets a script start measurements without a browser, within its own quotas. It sees only the measurements it
          started. The key is shown once, when you create it; only a hash is kept.
        </p>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon /> Create a key
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden sm:table-cell">Starts with</TableHead>
            <TableHead className="hidden md:table-cell">Quota</TableHead>
            <TableHead className="hidden lg:table-cell">Last used</TableHead>
            <TableHead className="text-right">Last 24 h</TableHead>
            <TableHead>State</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                No keys yet.
              </TableCell>
            </TableRow>
          )}
          {data?.map((key) => (
            <TableRow key={key.id}>
              <TableCell className="whitespace-normal font-medium">
                {key.name}
                <div className="text-xs font-normal text-muted-foreground sm:hidden">{key.prefix}…</div>
              </TableCell>
              <TableCell className="hidden font-mono text-xs sm:table-cell">{key.prefix}…</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {key.per_minute} / min, {key.per_day} / day
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{when(key.last_used_at)}</TableCell>
              <TableCell className="text-right tabular-nums">{key.made_24h}</TableCell>
              <TableCell>
                <Badge variant={key.revoked_at ? "outline" : "default"}>{key.revoked_at ? "revoked" : "active"}</Badge>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {!key.revoked_at && (
                  <>
                    <Button size="sm" variant="outline" className="mr-2" onClick={() => setEditing(key)}>
                      <PencilIcon /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => revoke(key)}>
                      Revoke
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editing && (
        <KeyDialog
          key={editing === "new" ? "new" : editing.id}
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={async (result) => {
            setEditing(null);
            if (result) setCreated(result);
            await reload();
          }}
        />
      )}

      <SecretDialog
        open={created !== null}
        onClose={() => setCreated(null)}
        title="Your API key"
        description="Copy it now; only a hash is stored, so it cannot be shown again."
        secret={secret}
      >
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <p className="text-muted-foreground">Ask for a result as text:</p>
            <CopyBlock label="the curl command" text={`curl -s -H "Authorization: Bearer ${secret}" "${origin}/api/v1/text?target=example.com&kind=ping"`} />
          </div>
          <div className="space-y-1.5">
            <p className="text-muted-foreground">or with the command-line client (see the ipping README):</p>
            <CopyBlock label="the client setup" text={`export IPPING_SERVER=${origin}\nexport IPPING_API_KEY=${secret}\nipping-cli ping example.com`} />
          </div>
        </div>
      </SecretDialog>
    </div>
  );
}

function KeyDialog({ existing, onClose, onDone }: { existing: Key | null; onClose: () => void; onDone: (created: Created | null) => Promise<void> }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [perMinute, setPerMinute] = useState(String(existing?.per_minute ?? 30));
  const [perDay, setPerDay] = useState(String(existing?.per_day ?? 1000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), per_minute: Number(perMinute), per_day: Number(perDay) };
    try {
      if (existing) {
        await api("PATCH", `/admin/api-keys/${existing.id}`, body);
        toast.success("Saved");
        await onDone(null);
      } else {
        await onDone(await api<Created>("POST", "/admin/api-keys", body));
      }
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <DialogHeader>
            <DialogTitle>{existing ? "Edit the key" : "Create an API key"}</DialogTitle>
            <DialogDescription>Give it a name that says what uses it, and the most it may do.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="k-name">Name</Label>
            <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deploy pipeline" required maxLength={80} autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="k-min">Measurements a minute</Label>
              <Input id="k-min" type="number" min={1} max={600} value={perMinute} onChange={(e) => setPerMinute(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-day">Measurements a day</Label>
              <Input id="k-day" type="number" min={1} max={100000} value={perDay} onChange={(e) => setPerDay(e.target.value)} required />
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>That could not be saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {existing ? "Save" : "Create the key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
