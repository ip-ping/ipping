"use client";

import { useId } from "react";

import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { CopyButton } from "./code";
import { useGuide } from "./guide-context";

/** The two things every request needs: where to send it, and, if there is one, the key to send it with. */
export function ConnectPanel() {
  const { baseUrl, apiKey, setApiKey } = useGuide();
  const id = useId();
  const api = baseUrl ? `${baseUrl}/api/v1` : "";
  const shaped = !apiKey || apiKey.startsWith("ipk_");
  return (
    <Panel
      label="Connect"
      meta={<Badge variant="secondary" data-testid="connect-mode">{apiKey ? `API key ${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : "Browser session"}</Badge>}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-url`}>Address of the API</Label>
          <div className="flex items-center gap-1">
            <Input id={`${id}-url`} readOnly value={api} className="font-mono text-xs" placeholder="https://…/api/v1" />
            <CopyButton text={api} />
          </div>
          <p className="text-xs text-muted-foreground">Every endpoint below is under this address, and answers JSON.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-key`}>API key (optional)</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-key`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="ipk_…"
              value={apiKey}
              aria-invalid={shaped ? undefined : true}
              onChange={(e) => setApiKey(e.target.value.trim())}
            />
            {apiKey && (
              <Button type="button" variant="outline" onClick={() => setApiKey("")}>
                Clear
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {shaped
              ? "An administrator makes keys under Admin, API keys. A key stays in this tab and goes only to this site."
              : "Keys start with ipk_. Anything else is treated as no key at all."}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {apiKey
          ? "Send uses your key, the way a script does: an Authorization header and no cookies."
          : "Send uses your browser session, the way this site does. Some endpoints need an API key: paste one to try them."}
      </p>
    </Panel>
  );
}
