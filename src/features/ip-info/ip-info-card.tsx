import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/provider";

import type { IpInfo } from "./describe";
import { IpInfoDetails } from "./ip-info-details";

/** What the IP data sources say about one address, voted: the address, then a row for each field with how sure it is. */
export function IpInfoCard({ info }: { info: IpInfo }) {
  const { t } = useI18n();
  return (
    <div data-testid="ip-info">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-semibold [overflow-wrap:anywhere]">{info.address}</span>
        <Badge variant="outline">IPv{info.version}</Badge>
        {!info.public && <Badge variant="secondary">{t("ip.notPublic")}</Badge>}
      </div>
      <IpInfoDetails info={info} />
    </div>
  );
}
