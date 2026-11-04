"use client";

import { ActivityIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNodes } from "@/features/nodes/use-nodes";
import { api, ApiError, type Measurement, type Schemas } from "@/lib/api/client";
import { flag, place } from "@/lib/format";

type Request = Schemas["CreateMeasurementRequest"];

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value}
        items={options}
        onValueChange={(next) => next !== null && onChange(next as T)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function MeasureForm({ initialTarget = "" }: { initialTarget?: string }) {
  const router = useRouter();
  const { nodes } = useNodes();
  const online = nodes?.filter((n) => n.online) ?? [];

  const [target, setTarget] = useState(initialTarget);
  const [dnsMode, setDnsMode] = useState<Request["dns_mode"]>("fixed");
  const [family, setFamily] = useState<Request["family"]>("auto");
  const [count, setCount] = useState("4");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Request = {
        target: target.trim(),
        kind: "ping",
        dns_mode: dnsMode,
        family,
        count: Number(count),
        node_ids: scope === "selected" ? [...selected] : null,
      };
      const created = await api<Measurement>("POST", "/measurements", body);
      router.push(`/measurements/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Something went wrong."));
      setBusy(false);
    }
  };

  const noNodes = nodes !== null && online.length === 0;
  const needsSelection = scope === "selected" && selected.size === 0;

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="target">IP address, hostname or URL</Label>
            <div className="flex gap-2">
              <Input
                id="target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="1.1.1.1, example.com or https://example.com/"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="h-9 font-mono"
                required
                autoFocus
              />
              <Button type="submit" disabled={busy || !target.trim() || noNodes || needsSelection}>
                {busy ? <Loader2Icon className="animate-spin" /> : <ActivityIcon />}
                Ping
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {nodes === null
                ? "Checking which nodes are online…"
                : `${online.length} node${online.length === 1 ? "" : "s"} online.`}{" "}
              For a URL only the host is used.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Choice
              label="Name resolution"
              value={dnsMode}
              onChange={setDnsMode}
              options={[
                { value: "fixed", label: "Same IP for every node" },
                { value: "regional", label: "Each node resolves it" },
              ]}
            />
            <Choice
              label="IP version"
              value={family}
              onChange={setFamily}
              options={[
                { value: "auto", label: "Automatic" },
                { value: "4", label: "IPv4" },
                { value: "6", label: "IPv6" },
              ]}
            />
            <Choice
              label="Echo requests per node"
              value={count}
              onChange={setCount}
              options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: String(n), label: String(n) }))}
            />
            <div className="space-y-1.5">
              <Label>Nodes</Label>
              <div className="flex gap-2">
                <Select
                  value={scope}
                  items={[
                    { value: "all", label: "All online nodes" },
                    { value: "selected", label: `Selected (${selected.size})` },
                  ]}
                  onValueChange={(next) => {
                    if (next === null) return;
                    setScope(next as "all" | "selected");
                    if (next === "selected") setPicking(true);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All online nodes</SelectItem>
                    <SelectItem value="selected">Selected ({selected.size})</SelectItem>
                  </SelectContent>
                </Select>
                <Dialog open={picking} onOpenChange={setPicking}>
                  <DialogTrigger render={<Button type="button" variant="outline" disabled={scope !== "selected"} />}>
                    Choose
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Choose nodes</DialogTitle>
                      <DialogDescription>
                        Only nodes that are online right now can be selected.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {online.map((node) => (
                        <label key={node.id} className="flex cursor-pointer items-center gap-3 text-sm">
                          <Checkbox
                            checked={selected.has(node.id)}
                            onCheckedChange={(checked) =>
                              setSelected((current) => {
                                const next = new Set(current);
                                if (checked) next.add(node.id);
                                else next.delete(node.id);
                                return next;
                              })
                            }
                          />
                          <span className="font-medium">{node.name}</span>
                          <span className="text-muted-foreground">
                            {flag(node.country)} {place(node)}
                          </span>
                        </label>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setSelected(new Set(online.map((n) => n.id)))}>
                        Select all
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
                        Clear
                      </Button>
                      <Button type="button" onClick={() => setPicking(false)}>
                        Done
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          {noNodes && (
            <Alert>
              <AlertTitle>No node is online</AlertTitle>
              <AlertDescription>
                Measurements need at least one approved, connected node.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>That measurement could not start</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
