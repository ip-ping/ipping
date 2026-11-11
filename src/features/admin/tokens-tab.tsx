"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

import { CopyBlock, SecretDialog } from "./secret-dialog";

type Token = Schemas["TokenOut"];
type Created = Schemas["TokenCreated"];

export function TokensTab() {
  const { data, reload } = useApiData<Token[]>("/admin/enrollment-tokens", 10_000);
  const [label, setLabel] = useState("");
  const [ttl, setTtl] = useState("60");
  const [community, setCommunity] = useState(false);
  const [reusable, setReusable] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<Created>("POST", "/admin/enrollment-tokens", {
        label: label.trim() || null,
        ttl_minutes: Number(ttl),
        tier: community ? "community" : "official",
        reusable,
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
  // A plain-HTTP site on another host is refused by nodes unless they are told it is fine.
  const plainHttp =
    origin.startsWith("http://") && !/^http:\/\/(localhost|127\.|\[::1\])/.test(origin);
  const token = created?.token ?? "";

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="token-label">Label (optional)</Label>
          <Input id="token-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Falkenstein 1" className="w-56" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token-ttl">Valid for (minutes)</Label>
          <Input id="token-ttl" type="number" min={1} max={43200} value={ttl} onChange={(e) => setTtl(e.target.value)} className="w-32" />
        </div>
        <Label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
          <Checkbox checked={reusable} onCheckedChange={(checked) => setReusable(checked === true)} />
          Reusable (many nodes can enroll with it)
        </Label>
        <Label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
          <Checkbox checked={community} onCheckedChange={(checked) => setCommunity(checked === true)} />
          For a volunteer&apos;s node (community)
        </Label>
        <Button type="submit" disabled={busy}>
          Create enrollment token
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {reusable
          ? "A reusable key enrolls any number of nodes until it expires (up to 30 days = 43200 minutes) or you revoke it: keep it as private as the nodes you give it to. "
          : "A key works once and expires. "}
        The node trades it for its own credential, then waits for your approval on the Nodes tab, so a key on its own
        puts nothing into a measurement.{" "}
        {community && (
          <span>
            A community node is left out of measurements unless a visitor asks for it, is rate limited, and cannot
            move a location estimate until you have checked its place. What it reports is not verified.
          </span>
        )}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead className="hidden md:table-cell">Created by</TableHead>
            <TableHead className="hidden sm:table-cell">Expires</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="hidden sm:table-cell">For</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                No tokens yet.
              </TableCell>
            </TableRow>
          )}
          {data?.map((token) => (
            <TableRow key={token.id}>
              <TableCell className="whitespace-normal">
                {token.label ?? <span className="text-muted-foreground">–</span>}
                {token.reusable && (
                  <div className="text-xs text-muted-foreground">
                    reusable · {token.uses} node{token.uses === 1 ? "" : "s"} enrolled
                  </div>
                )}
                <div className="text-xs text-muted-foreground sm:hidden">
                  expires {new Date(token.expires_at).toLocaleString()}
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{token.created_by}</TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{new Date(token.expires_at).toLocaleString()}</TableCell>
              <TableCell>
                <Badge variant={token.state === "active" ? "default" : "outline"}>{token.state}</Badge>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{token.tier === "community" ? "a volunteer" : "us"}</TableCell>
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
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <p className="text-muted-foreground">
              On the node&apos;s host, with the installer (see the ipping-node README for downloading it):
            </p>
            <CopyBlock
              label="the install command"
              text={`sudo bash ipping-node.sh install --server ${origin} --token ${token}${plainHttp ? " --allow-insecure" : ""}`}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-muted-foreground">or by hand with the node binary:</p>
            <CopyBlock
              label="the enroll command"
              text={`ipping-node enroll --server ${origin} --token ${token}${plainHttp ? " --insecure" : ""}`}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-muted-foreground">or with Docker, in the node&apos;s .env file:</p>
            <CopyBlock
              label="the Docker settings"
              text={`IPPING_NODE_SERVER=${origin}\nIPPING_NODE_ENROLL_TOKEN=${token}${plainHttp ? "\nIPPING_NODE_ALLOW_INSECURE=1" : ""}`}
            />
          </div>
          {plainHttp && (
            <p className="text-xs text-muted-foreground">
              This site is plain HTTP, so the node&apos;s credential would travel unencrypted. Give the
              site a domain for HTTPS, or only do this on a network you trust.
            </p>
          )}
        </div>
      </SecretDialog>
    </div>
  );
}
