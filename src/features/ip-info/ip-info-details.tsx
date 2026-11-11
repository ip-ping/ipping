"use client";

import type { ReactNode } from "react";

import { flag } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { Confidence } from "./confidence";
import { nothingToShow, positionLine, sure, type IpInfo, type VotedField } from "./describe";
import { SourceAnswers } from "./source-answers";

function Row({ label, percent, children, testId }: { label: string; percent?: number | null; children: ReactNode; testId?: string }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:gap-x-4" data-testid={testId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
      <dd className="min-w-[3.5rem]">{percent != null ? <Confidence percent={percent} /> : null}</dd>
    </div>
  );
}

/**
 * Everything the vote answered about an address, a row for each field with how sure the answer is, then the sources it came from.
 * A field nobody had an answer for has no row; an address that nothing is known about says so instead.
 */
export function IpInfoDetails({ info }: { info: IpInfo }) {
  const { t } = useI18n();
  const nothing = nothingToShow(info);
  const position = positionLine(info);
  const row = (field: VotedField) => sure(info, field);
  return (
    <div data-testid="ip-info-details">
      {nothing ? (
        <p className="mt-2 text-sm text-muted-foreground">{nothing}</p>
      ) : (
        <dl className="mt-2 divide-y">
          {info.country && (
            <Row label={t("ip.country")} percent={row("country")} testId="ip-country">
              {flag(info.country)} {info.country_name ?? info.country}
            </Row>
          )}
          {info.region && (
            <Row label={t("ip.region")} percent={row("region")} testId="ip-region">
              {info.region}
            </Row>
          )}
          {info.city && (
            <Row label={t("ip.city")} percent={row("city")} testId="ip-city">
              {info.city}
            </Row>
          )}
          {position && (
            <Row label={t("ip.position")} percent={row("location")} testId="ip-position">
              {position}
            </Row>
          )}
          {info.postal_code && (
            <Row label={t("ip.postal")} percent={row("postal_code")} testId="ip-postal">
              {info.postal_code}
            </Row>
          )}
          {info.time_zone && (
            <Row label={t("ip.timeZone")} percent={row("time_zone")} testId="ip-time-zone">
              {info.time_zone}
            </Row>
          )}
          {info.asn != null && (
            <Row label={t("ip.asn")} percent={row("asn")} testId="ip-asn">
              AS{info.asn}
            </Row>
          )}
          {info.organization && (
            <Row label={t("ip.organization")} percent={row("organization")} testId="ip-organization">
              {info.organization}
            </Row>
          )}
          {info.network && (
            <Row label={t("ip.prefix")}>
              <span className="font-mono text-xs">{info.network}</span>
            </Row>
          )}
        </dl>
      )}
      <SourceAnswers info={info} />
      {(info.source || info.attribution) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {info.source ? t("ip.from", { sources: info.source }) : null}
          {info.database_built ? ` ${t("ip.built", { date: info.database_built.slice(0, 10) })}` : null} {info.attribution}
        </p>
      )}
    </div>
  );
}
