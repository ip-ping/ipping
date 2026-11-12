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

import { CommunityBadge } from "@/components/community-badge";
import { SponsorMark } from "@/components/network-name";


type Update = Schemas["UpdateNodeRequest"];

type Audit = { status: "consistent" | "inconsistent" | "inconclusive"; summary: string; checked_at: string; address?: string };

/** What the last location audit found, as the node carries it (see the backend's `nodes/audit.py`). */
const auditOf = (node: AdminNode): Audit | null => (node.location_audit as Audit | null) ?? null;

function AuditNote({ audit }: { audit: Audit }) {
  const variant = audit.status === "inconsistent" ? "destructive" : audit.status === "consistent" ? "secondary" : "outline";
  return (
    <div className="space-y-1 text-xs" data-testid="location-audit">
      <Badge variant={variant}>location {audit.status}</Badge>
      <p className="text-muted-foreground">{audit.summary}</p>
    </div>
  );
}

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

/** The fields of the dialog, as the strings the inputs hold. */
const formOf = (node: AdminNode) => ({
  name: node.custom_name,
  country: node.country ?? "",
  region: node.region ?? "",
  city: node.city ?? "",
  provider: node.provider ?? "",
  asn: node.asn?.toString() ?? "",
  latitude: node.latitude?.toString() ?? "",
  longitude: node.longitude?.toString() ?? "",
  verified: node.location_verified,
  community: node.tier === "community",
  sponsored: node.sponsored,
});
type Form = ReturnType<typeof formOf>;
type Key = keyof Form;

function EditNodeDialog({ node, onClose, onSaved }: { node: AdminNode; onClose: () => void; onSaved: () => void }) {
  // The node as last saved or filled in. The form is compared with it so that only what was changed is sent: a field
  // that is sent becomes the administrator's own, and one that is left alone keeps following the IP data.
  const [current, setCurrent] = useState(node);
  const initial = formOf(current);
  const [form, setForm] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const set = (key: Key) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const auto = new Set(current.auto_fields);
  const changed = (key: Key) => form[key] !== initial[key];
  const dirty = (Object.keys(form) as Key[]).some(changed);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const body: Update = {};
    if (changed("name")) body.name = form.name.trim();
    if (changed("country")) body.country = text(form.country);
    if (changed("region")) body.region = text(form.region);
    if (changed("city")) body.city = text(form.city);
    if (changed("provider")) body.provider = text(form.provider);
    if (changed("asn")) body.asn = number(form.asn);
    // A position is a pair: change one half and both are sent.
    if (changed("latitude") || changed("longitude")) {
      body.latitude = number(form.latitude);
      body.longitude = number(form.longitude);
    }
    if (changed("verified")) body.location_verified = form.verified;
    if (changed("community")) body.tier = form.community ? "community" : "official";
    if (changed("sponsored")) body.sponsored = form.sponsored;
    try {
      if (Object.keys(body).length > 0) await api("PATCH", `/admin/nodes/${node.id}`, body);
      toast.success("Node updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  };

  const fill = async () => {
    setBusy(true);
    try {
      const filled = await api<AdminNode>("POST", `/admin/nodes/${node.id}/autofill`);
      const before = new Set(current.auto_fields);
      const gained = filled.auto_fields.filter((f) => !before.has(f)).length;
      toast.success(gained > 0 ? "Filled in from the IP data" : "Nothing to fill in: every field is set or has no data");
      setCurrent(filled);
      // Keep what was typed in the fields that were not touched by the data.
      const next = formOf(filled);
      const kept = Object.fromEntries((Object.keys(form) as Key[]).filter((k) => changed(k) && !filled.auto_fields.includes(k)).map((k) => [k, form[k]]));
      setForm({ ...next, ...kept });
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // A field that was emptied goes back to the IP data when it is saved.
  const cleared = (key: Key) => changed(key) && String(form[key]).trim() === "" && String(initial[key]) !== "";

  const field = (key: Key, label: string, extra: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`node-${key}`}>{label}</Label>
        {!changed(key) && auto.has(key) && <Badge variant="secondary">auto</Badge>}
      </div>
      <Input id={`node-${key}`} value={String(form[key])} onChange={set(key)} {...extra} />
      {cleared(key) && <p className="text-xs text-muted-foreground">{key === "name" ? "Named after its place and network once saved" : "Automatic once saved"}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {node.name}</DialogTitle>
          <DialogDescription>
            Fields marked <em>auto</em> are filled in from the IP data for the address the node connects from, and follow it as it
            is updated. Type a value to keep your own; clear a field to go back to the automatic one. Mark the location verified
            once you have checked it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          {field("name", "Name (optional)", { placeholder: node.name })}
          <div className="grid grid-cols-3 gap-3">
            {field("country", "Country", { maxLength: 2, placeholder: "DE" })}
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
          <div className="flex items-center gap-3">
            <Switch id="community" checked={form.community} onCheckedChange={(community) => setForm({ ...form, community })} />
            <Label htmlFor="community">Run by a volunteer (community node)</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="sponsored" checked={form.sponsored} onCheckedChange={(sponsored) => setForm({ ...form, sponsored })} />
            <Label htmlFor="sponsored">Sponsored</Label>
          </div>
          {form.sponsored && (
            <p className="text-xs text-muted-foreground">
              {form.provider.trim() === ""
                ? "The provider's name stands out wherever the node is shown. This node has no provider yet: fill one in above, or fill it from the IP data."
                : `The provider's name (${form.provider.trim()}) stands out wherever the node is shown. A measurement keeps the node as it was when it began, so earlier results are not changed.`}
            </p>
          )}
          {auditOf(node) && <AuditNote audit={auditOf(node) as Audit} />}
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={fill} disabled={busy || !current.remote_addr} title={current.remote_addr ? undefined : "The node has not connected yet"}>
              Fill from IP data
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !dirty}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NodesTab() {
  const { data: all, error, reload } = useApiData<AdminNode[]>("/admin/nodes", 5000);
  // A revoked node is removed by the backend; one left over from before is not shown either.
  const data = all?.filter((node) => node.status !== "revoked");
  const [editing, setEditing] = useState<AdminNode | null>(null);
  const [revoking, setRevoking] = useState<AdminNode | null>(null);

  const act = async (path: string, success: string) => {
    try {
      await api("POST", path);
      toast.success(success);
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
            <TableHead className="hidden md:table-cell">Location</TableHead>
            <TableHead className="hidden lg:table-cell">Version</TableHead>
            <TableHead className="hidden md:table-cell">Connection</TableHead>
            <TableHead className="hidden md:table-cell">Status</TableHead>
            <TableHead className="hidden text-right md:table-cell">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No nodes yet. Create an enrollment token (Enrollment tab) and install the node on a host.
              </TableCell>
            </TableRow>
          )}
          {data?.map((node) => {
            const connection = (
              <>
                <Badge variant={node.online ? "default" : "outline"}>{node.online ? "Online" : "Offline"}</Badge>
                <div className="text-xs text-muted-foreground">
                  {node.online ? [node.ipv4 && "IPv4", node.ipv6 && "IPv6", ...(node.kinds ?? [])].filter(Boolean).join(" · ") : `seen ${ago(node.last_seen_at)}`}
                </div>
              </>
            );
            const status = (
              <Badge variant={node.status === "approved" ? "secondary" : node.status === "pending" ? "outline" : "destructive"}>
                {node.status === "pending" ? "Awaiting approval" : node.status}
              </Badge>
            );
            const actions = (
              <>
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
                    {node.latitude != null && (
                      <Button size="sm" variant="outline" onClick={() => act(`/admin/nodes/${node.id}/audit-location`, `Checked where ${node.name} is`)}>
                        Check location
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => setRevoking(node)}>
                      Revoke
                    </Button>
                  </>
                )}
              </>
            );
            return (
              <TableRow key={node.id}>
                <TableCell className="whitespace-normal">
                  <div className="font-medium">
                    {node.name}
                    <CommunityBadge tier={node.tier} />
                    <SponsorMark node={node} />
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">{node.remote_addr ?? ""}</div>
                  {auditOf(node) && (
                    <div className="mt-1">
                      <AuditNote audit={auditOf(node) as Audit} />
                    </div>
                  )}
                  {/* On a narrow screen everything about the node, and its buttons, goes under its name. */}
                  <div className="mt-2 space-y-2 md:hidden">
                    <div className="text-sm">
                      {flag(node.country)} {place(node)}
                      {!node.location_verified && <span className="text-xs text-muted-foreground"> · unverified</span>}
                      {node.version && <span className="text-xs text-muted-foreground"> · v{node.version}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {status}
                      <span>{connection}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">{actions}</div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {flag(node.country)} {place(node)}
                  {!node.location_verified && <div className="text-xs text-muted-foreground">unverified</div>}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{node.version ?? "–"}</TableCell>
                <TableCell className="hidden md:table-cell">{connection}</TableCell>
                <TableCell className="hidden md:table-cell">{status}</TableCell>
                <TableCell className="hidden space-x-1 text-right whitespace-nowrap md:table-cell">{actions}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {editing && <EditNodeDialog node={editing} onClose={() => setEditing(null)} onSaved={reload} />}

      <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoking?.name}?</DialogTitle>
            <DialogDescription>
              The node is disconnected at once and removed: its key stops working and it leaves this list for good. The
              measurements it took part in keep their results. To bring the host back it enrolls again with an enrollment
              key and waits for your approval like a new node.
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
    </div>
  );
}
