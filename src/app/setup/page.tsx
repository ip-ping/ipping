"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiData } from "@/lib/api/use-api-data";
import { api, errorMessage, setSession, type SessionInfo } from "@/lib/api/client";

export default function SetupPage() {
  const router = useRouter();
  const status = useApiData<{ needs_setup: boolean }>("/setup/status");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!status.data && !status.error) return <Skeleton className="mx-auto h-72 max-w-md" />;
  if (status.error) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-md">
        <AlertTitle>Could not reach the backend</AlertTitle>
        <AlertDescription>{status.error}</AlertDescription>
      </Alert>
    );
  }
  if (status.data && !status.data.needs_setup) {
    return (
      <Alert className="mx-auto max-w-md">
        <AlertTitle>Setup is already done</AlertTitle>
        <AlertDescription>
          An administrator exists. <Link href="/admin" className="underline">Sign in</Link>.
        </AlertDescription>
      </Alert>
    );
  }

  const mismatch = confirm !== "" && confirm !== password;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api<SessionInfo>("POST", "/setup", {
        setup_token: token.trim(),
        username,
        password,
      });
      setSession(session);
      router.push("/admin");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Panel label="Create the administrator" meta="one-time setup" className="mx-auto max-w-md">
      <p className="mb-4 text-sm text-muted-foreground">
        The setup token is printed in the backend log on first start (or set as IPPING_SETUP_TOKEN by the
        installer).
      </p>
      <div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="token">Setup token</Label>
            <Input id="token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" className="font-mono" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={12} required />
            <p className="text-xs text-muted-foreground">At least 12 characters.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Repeat password</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required aria-invalid={mismatch} />
            {mismatch && <p className="text-xs text-destructive">The passwords do not match.</p>}
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={busy || mismatch || password.length < 12}>
            Create administrator
          </Button>
        </form>
      </div>
    </Panel>
  );
}
