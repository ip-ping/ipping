"use client";

import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dashboard } from "@/features/admin/dashboard";
import { LoginForm } from "@/features/admin/login-form";
import { useAdminSession } from "@/features/admin/use-admin-session";

export default function AdminPage() {
  const { state, signedIn, signOut } = useAdminSession();

  switch (state.phase) {
    case "loading":
      return <Skeleton className="mx-auto h-64 max-w-sm" />;
    case "error":
      return (
        <Alert variant="destructive" className="mx-auto max-w-md">
          <AlertTitle>Could not reach the backend</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      );
    case "needs-setup":
      return (
        <Alert className="mx-auto max-w-md">
          <AlertTitle>No administrator exists yet</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Create the first administrator with the one-time setup token.</p>
            <Button render={<Link href="/setup" />}>Go to setup</Button>
          </AlertDescription>
        </Alert>
      );
    case "signed-out":
      return <LoginForm onSignedIn={signedIn} />;
    case "admin":
      return <Dashboard username={state.username} onSignOut={signOut} />;
  }
}
