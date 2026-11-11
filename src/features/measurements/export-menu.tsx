"use client";

import { ClipboardIcon, DownloadIcon, FileJsonIcon, TableIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Measurement } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/provider";

import { exportAs, exportFilename } from "./export";

function download(text: string, mime: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Take the results elsewhere: as text to paste, a CSV for a spreadsheet, or the full JSON. */
export function ExportMenu({ measurement }: { measurement: Measurement }) {
  const { t } = useI18n();
  const save = (format: "csv" | "json") => {
    const { text, mime, extension } = exportAs(measurement, format);
    download(text, mime, exportFilename(measurement, extension));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportAs(measurement, "text").text);
      toast.success(t("m.copiedText"));
    } catch {
      toast.error(t("m.copyFailed"));
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <DownloadIcon /> {t("m.export")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={copy}>
          <ClipboardIcon /> {t("m.copyText")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => save("csv")}>
          <TableIcon /> {t("m.downloadCsv")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => save("json")}>
          <FileJsonIcon /> {t("m.downloadJson")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
