"use client";

import { InfoIcon, Loader2Icon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/panel";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/provider";

import { looksLikeAddress, type IpInfo } from "./describe";
import { IpInfoCard } from "./ip-info-card";
import { lookupIp } from "./use-ip-info";

const WHY: Record<string, string> = {
  api_key_required: "On this site the lookup is for API keys and administrators. An administrator can open it to everyone on the admin page (IP data).",
  admin_required: "On this site the lookup is for administrators only. An administrator can change that on the admin page (IP data).",
  ip_lookup_disabled: "An administrator has turned the IP lookup off.",
  no_database: "No IP data source can answer. An administrator can turn one on, or give MaxMind its account, on the admin page (IP data).",
};

/**
 * The form's "IP info" option: what ipping's own IP databases say about an address, with no measurement and no nodes.
 * Leave the address empty to see the one this browser comes from. `tabs` is the form's own row of options, so it stays put.
 */
export function IpInfoLookup({ tabs, initialAddress = "" }: { tabs: ReactNode; initialAddress?: string }) {
  const { t } = useI18n();
  const [address, setAddress] = useState(initialAddress);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<IpInfo | null>(null);
  const [error, setError] = useState<{ title: string; text: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const typed = address.trim();
    setInfo(null);
    if (typed && !looksLikeAddress(typed)) {
      setError({ title: t("ip.notAddressTitle"), text: t("ip.notAddressText") });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setInfo(await lookupIp(typed || null));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setError({ title: t("ip.noAnswer"), text: WHY[code] ?? errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel label={t("form.command")} meta={<span className="normal-case tracking-normal">{t("kind.ip")}</span>}>
      <form onSubmit={submit} className="space-y-5">
        {tabs}
        <div className="space-y-1.5">
          <Label htmlFor="ip-address">{t("ip.address")}</Label>
          <div className="flex gap-2">
            <Input
              id="ip-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("ip.placeholder")}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="h-9 font-mono"
              autoFocus
            />
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <InfoIcon />}
              {t("ip.lookup")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("ip.help")}
          </p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription>{error.text}</AlertDescription>
          </Alert>
        )}
        {info && <IpInfoCard info={info} />}
      </form>
    </Panel>
  );
}
