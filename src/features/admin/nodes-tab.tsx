"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage, type AdminNode, type Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";
import { flag, place } from "@/lib/format";

import { SecretDialog } from "./secret-dialog";

type Update = Schemas["UpdateNodeRequest"];

function ago(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return "just now";
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 129600) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

const text = (value: string): string | null => (value.trim() === "" ? null : value.trim());
const number = (value: string): number | null => (value.trim() === "" ? null : Number(value));

function EditNodeDialog({ node, onClose, onSaved }: { node: AdminNode; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: node.name,
    country: node.country ?? "",
    region: node.region ?? "",
    city: node.city ?? "",
    provider: node.provider ?? "",
    asn: node.asn?.toString() ?? "",
    latitude: node.latitude?.toString() ?? "",
    longitude: node.longitude?.toString() ?? "",
    verified: node.location_verified,
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const body: Update = {
      name: form.name.trim(),
      country: text(form.country),
      region: text(form.region),
      city: text(form.city),
      provider: text(form.provider),
      asn: number(form.asn),
      latitude: number(form.latitude),
      longitude: number(form.longitude),
      location_verified: form.verified,
    };
    try {
      await api("PATCH", `/admin/nodes/${node.id}`, body);
      toast.success("Node updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  };

  const field = (key: keyof typeof form, label: string, extra: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`node-${key}`}>{label}</Label>
      <Input id={`node-${key}`} value={String(form[key])} onChange={set(key)} {...extra} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {node.name}</DialogTitle>
          <DialogDescription>
            The node declared its own location at enrollment. Correct it here, then mark it
            verified once you have checked it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          {field("name", "Name", { required: true })}
          <div className="grid grid-cols-3 gap-3">
            {field("country", "Country (ISO)", { maxLength: 2, placeholder: "DE" })}
            {field("region", "Region")}
            {field("city", "City")}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field("provider", "Provider")}
            {field("asn", "ASN", { inputMode: "numeric" })}
            <span />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("latitude", "Latitude", { inputMode: "decimal" })}
            {field("longitude", "Longitude", { inputMode: "decimal" })}
          </div>
          <div className="flex items-center gap-3">
            <Switch id="verified" checked={form.verified} onCheckedChange={(verified) => setForm({ ...form, verified })} />
            <Label htmlFor="verified">Location verified by an administrator</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NodesTab() {
  const { data, error, reload } = useApiData<AdminNode[]>("/admin/nodes", 5000);
  const [editing, setEditing] = useState<AdminNode | null>(null);
  const [revoking, setRevoking] = useState<AdminNode | null>(null);
  const [rotated, setRotated] = useState<string | null>(null);

  const act = async (path: string, success: string) => {
    try {
      await api("POST", path);
      toast.success(success);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const rotate = async (node: AdminNode) => {
    try {
      const result = await api<{ credential: string }>("POST", `/admin/nodes/${node.id}/rotate-credential`);
      setRotated(result.credential);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Node</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Connection</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No nodes yet. Create an enrollment token and run <code>ipping-node enroll</code> on a host.
              </TableCell>
            </TableRow>
          )}
          {data?.map((node) => (
            <TableRow key={node.id}>
              <TableCell>
                <div className="font-medium">{node.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{node.remote_addr ?? ""}</div>
              </TableCell>
              <TableCell>
                {flag(node.country)} {place(node)}
                {!node.location_verified && <div className="text-xs text-muted-foreground">unverified</div>}
              </TableCell>
              <TableCell className="text-muted-foreground">{node.version ?? "–"}</TableCell>
              <TableCell>
                <Badge variant={node.online ? "default" : "outline"}>{node.online ? "Online" : "Offline"}</Badge>
                <div className="text-xs text-muted-foreground">
                  {node.online ? [node.ipv4 && "IPv4", node.ipv6 && "IPv6"].filter(Boolean).join(" · ") : `seen ${ago(node.last_seen_at)}`}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={node.status === "approved" ? "secondary" : node.status === "pending" ? "outline" : "destructive"}>
                  {node.status === "pending" ? "Awaiting approval" : node.status}
                </Badge>
              </TableCell>
              <TableCell className="space-x-1 text-right whitespace-nowrap">
                {node.status === "pending" && (
                  <Button size="sm" onClick={() => act(`/admin/nodes/${node.id}/approve`, `${node.name} approved`)}>
                    Approve
                  </Button>
                )}
                {node.status !== "revoked" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing(node)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rotate(node)}>
                      Rotate key
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setRevoking(node)}>
                      Revoke
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editing && <EditNodeDialog node={editing} onClose={() => setEditing(null)} onSaved={reload} />}

      <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoking?.name}?</DialogTitle>
            <DialogDescription>
              The node is disconnected immediately and can never connect again. To bring the host
              back it must enroll again with a new token.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (revoking) await act(`/admin/nodes/${revoking.id}/revoke`, `${revoking.name} revoked`);
                setRevoking(null);
              }}
            >
              Revoke node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SecretDialog
        open={rotated !== null}
        onClose={() => setRotated(null)}
        title="New node credential"
        description="The old credential stopped working and the node was disconnected. Put this one in the node's credential file (mode 600); it will not be shown again."
        secret={rotated ?? ""}
      />
    </div>
  );
}
