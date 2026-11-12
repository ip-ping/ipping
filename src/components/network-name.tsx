"use client";

import { StarIcon } from "lucide-react";
import { Fragment } from "react";

import { Badge } from "@/components/ui/badge";
import type { NetworkPart } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

/**
 * A sponsored node's provider: its name in a badge, so that it stands out from the muted line of words around it. The
 * title is what a pointer is told and the hidden words are what a screen reader is.
 */
export function SponsoredName({ name }: { name: string }) {
  const { t } = useI18n();
  return (
    <Badge title={t("node.sponsored")} data-testid="sponsored-provider" className="max-w-full align-middle">
      <StarIcon aria-hidden data-icon="inline-start" />
      <span className="sr-only">{t("node.sponsored")}: </span>
      <span className="truncate">{name}</span>
    </Badge>
  );
}

/** A line about a node's network (or place and network) drawn from its parts: the provider of a sponsored node stands out. */
export function NetworkName({ parts }: { parts: readonly NetworkPart[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && " · "}
          {part.sponsored ? <SponsoredName name={part.text} /> : part.text}
        </Fragment>
      ))}
    </>
  );
}

/**
 * For an administrator's list of nodes: the provider of a sponsored node standing out beside its name, as it does for a visitor, or
 * only that the node is sponsored when it has no provider to show yet. Nothing for a node that is not sponsored.
 */
export function SponsorMark({ node }: { node: { sponsored?: boolean | null; provider?: string | null } }) {
  const { t } = useI18n();
  if (!node.sponsored) return null;
  return (
    <span className="ml-1.5 align-middle" data-testid="sponsor-mark">
      {node.provider ? <SponsoredName name={node.provider} /> : <Badge variant="outline">{t("node.sponsored")}</Badge>}
    </span>
  );
}
