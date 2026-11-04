"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage, type Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";

import { SecretDialog } from "./secret-dialog";

type Token = Schemas["TokenOut"];
type Created = Schemas["TokenCreated"];

export function TokensTab() {
  const { data, reload } = useApiData<Token[]>("/admin/enrollment-tokens", 10_000);
  const [label, setLabel] = useState("");
  const [ttl, setTtl] = useState("60");
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<Created>("POST", "/admin/enrollment-tokens", {
        label: label.trim() || null,
        ttl_minutes: Number(ttl),
      });
      setCreated(result);
      setLabel("");
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api("DELETE", `/admin/enrollment-tokens/${id}`);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="token-label">Label (optional)</Label>
          <Input id="token-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Falkenstein 1" className="w-56" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token-ttl">Valid for (minutes)</Label>
          <Input id="token-ttl" type="number" min={1} max={1440} value={ttl} onChange={(e) => setTtl(e.target.value)} className="w-32" />
        </div>
        <Button type="submit" disabled={busy}>
          Create enrollment token
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        A token works once and expires. The node trades it for its own credential, then waits for
        your approval on the Nodes tab.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Created by</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>State</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                No tokens yet.
              </TableCell>
            </TableRow>
          )}
          {data?.map((token) => (
            <TableRow key={token.id}>
              <TableCell>{token.label ?? <span className="text-muted-foreground">–</span>}</TableCell>
              <TableCell className="text-muted-foreground">{token.created_by}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(token.expires_at).toLocaleString()}</TableCell>
              <TableCell>
                <Badge variant={token.state === "active" ? "default" : "outline"}>{token.state}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {token.state === "active" && (
                  <Button size="sm" variant="outline" onClick={() => revoke(token.id)}>
                    Revoke
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <SecretDialog
        open={created !== null}
        onClose={() => setCreated(null)}
        title="Enrollment token"
        description="Copy it now; only a hash is stored, so it cannot be shown again."
        secret={created?.token ?? ""}
      >
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">With the node binary on its host:</p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
            {`ipping-node enroll --server ${origin} \\\n  --token ${created?.token ?? ""}`}
          </pre>
          <p className="text-muted-foreground">or with Docker, in the node&apos;s .env file:</p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
            {`IPPING_NODE_SERVER=${origin}\nIPPING_NODE_ENROLL_TOKEN=${created?.token ?? ""}`}
          </pre>
        </div>
      </SecretDialog>
    </div>
  );
}
