"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Text with `code` in backticks drawn as code: how the guide's sentences name a field or a value. */
export function Rich({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/`([^`]+)`/);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard blocked (an insecure page): the text is selectable
        }
      }}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? "Copied" : label}
    </Button>
  );
}

/** Code to read and copy. It scrolls inside its box, so a long line never widens the page. */
export function CodeBlock({ code, label, className, children }: { code: string; label?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-lg border bg-muted/40", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1">
        <span className="text-xs text-muted-foreground">{label ?? children}</span>
        <CopyButton text={code} />
      </div>
      <pre className="max-h-80 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre" tabIndex={0}>
        {code}
      </pre>
    </div>
  );
}
