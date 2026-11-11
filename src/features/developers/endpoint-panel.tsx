"use client";

import { ChevronDownIcon, PlayIcon, SquareIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage } from "@/lib/api/client";

import { CodeBlock, Rich } from "./code";
import { FieldInput } from "./field-input";
import { AUTH_LABEL, GUIDE, PRESETS, followsKind, orderedFields, splitFields, type OpGuide } from "./guide";
import { useGuide, type OpState } from "./guide-context";
import { buildRequest, pretty, ready, send, snippets, stream, type Built, type Values } from "./request";
import { fieldsOf, operation, type Operation } from "./spec";

const SITE = "https://your-site.example";

function Header({ op, guide, step, compact, lead }: { op: Operation; guide: OpGuide; step?: number; compact?: boolean; lead?: string }) {
  return (
    <div className="space-y-2">
      {!compact && (
      <div className="flex flex-wrap items-center gap-2">
        {step !== undefined && (
          <Badge variant="outline" className="size-6 justify-center rounded-full p-0" aria-label={`Step ${step}`}>
            {step}
          </Badge>
        )}
        <h3 className="text-base font-semibold">{guide.title}</h3>
      </div>
      )}
      {lead && <Rich text={lead} className="block text-sm" />}
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <Badge variant={op.method === "GET" ? "secondary" : "default"}>{op.method}</Badge>}
        {!compact && <code className="font-mono text-xs break-all">{op.path}</code>}
        <Badge variant="outline">{AUTH_LABEL[guide.auth]}</Badge>
        {guide.starts && <Badge variant="outline">starts a real measurement</Badge>}
      </div>
      <Rich text={guide.blurb} className="block text-sm text-muted-foreground" />
    </div>
  );
}

function ResponseView({ state, guide }: { state: OpState; guide: OpGuide }) {
  if (state.busy) return <Skeleton className="h-24 w-full" />;
  if (state.error) {
    return (
      <Alert variant="destructive" data-testid="response-error">
        <AlertTitle>The request did not get an answer</AlertTitle>
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  const result = state.result;
  if (!result) return <p className="text-sm text-muted-foreground">The answer appears here when you press Send.</p>;
  const body = pretty(result);
  const useful = result.headers.filter(([name]) => !["date", "server", "connection", "content-length", "vary"].includes(name));
  return (
    <div className="space-y-2" data-testid="response">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={result.ok ? "secondary" : "destructive"} data-testid="response-status">
          {result.status} {result.statusText}
        </Badge>
        <span>{result.ms} ms</span>
        {result.contentType && <span className="font-mono">{result.contentType.split(";")[0]}</span>}
      </div>
      <CodeBlock code={body.text || "(no body)"} label="Answer" />
      {body.cut && <p className="text-xs text-muted-foreground">Only the first part is shown. The answer is longer.</p>}
      {state.note && <p className="text-xs text-muted-foreground">{state.note}</p>}
      {guide.captures && result.ok && !state.note && <p className="text-xs text-muted-foreground">No measurement id in this answer.</p>}
      {useful.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2 text-xs text-muted-foreground" />}>
            Headers ({useful.length})
            <ChevronDownIcon />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 space-y-0.5 font-mono text-xs break-all text-muted-foreground">
              {useful.map(([name, value]) => (
                <li key={name}>
                  {name}: {value}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/** The follow-live operation: press Watch and the messages appear as they arrive. */
function Watch({ built, apiKey, canRun }: { built: Built; apiKey: string; canRun: boolean }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);

  const start = async () => {
    stop.current?.abort();
    const controller = new AbortController();
    stop.current = controller;
    setText("");
    setStatus(null);
    setRunning(true);
    try {
      const done = await stream(built, apiKey, (chunk) => setText((so) => (so + chunk).slice(-20000)), controller.signal);
      setStatus(done.status);
    } catch (e) {
      if (!controller.signal.aborted) setText((so) => `${so}\n${errorMessage(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button type="button" variant="outline" onClick={() => stop.current?.abort()}>
            <SquareIcon /> Stop
          </Button>
        ) : (
          <Button type="button" onClick={start} disabled={!canRun}>
            <PlayIcon /> Watch
          </Button>
        )}
        {status !== null && <Badge variant={status < 400 ? "secondary" : "destructive"}>ended: {status}</Badge>}
      </div>
      <CodeBlock code={text || "(nothing yet)"} label="Messages" />
    </div>
  );
}

export function EndpointPanel({ opKey, step, compact, lead }: { opKey: string; step?: number; compact?: boolean; lead?: string }) {
  const op = operation(opKey);
  const guide = GUIDE[opKey];
  const guideState = useGuide();
  const state = guideState.op(opKey);
  const uid = useId();
  const fields = useMemo(() => fieldsOf(op), [op]);
  const hasId = fields.some((f) => f.name === "measurement_id");

  // What the form holds: its example, then what was typed; the measurement the guide started fills in where one is asked for.
  const typed: Values = useMemo(() => ({ ...guide.example, ...state.values }), [guide.example, state.values]);
  const values: Values = useMemo(
    () => ({ ...typed, ...(hasId && typed.measurement_id === undefined && guideState.measurementId ? { measurement_id: guideState.measurementId } : {}) }),
    [typed, hasId, guideState.measurementId],
  );
  const filledIn = hasId && typed.measurement_id === undefined && Boolean(guideState.measurementId);
  const built = useMemo(() => buildRequest(op, values, orderedFields(opKey, fields, values)), [op, opKey, values, fields]);

  const needsKey = guide.auth === "key";
  const key = guide.auth === "either" || needsKey ? guideState.apiKey : "";
  const blocked = needsKey && !guideState.apiKey;
  const canRun = ready(built) && !blocked;
  // How the request is made: a script's way (a key) or the site's own (the browser session). Open endpoints need neither.
  const via = guide.auth === "none" ? "" : guide.auth === "session" ? "with your browser session" : key ? "with your API key" : needsKey ? "" : "with your browser session";
  const { primary, more } = splitFields(opKey, fields, values);
  const set = (name: string, value: string | boolean | undefined) => guideState.patch(opKey, { values: { ...typed, [name]: value } });

  const press = async () => {
    guideState.patch(opKey, { busy: true, error: undefined, note: undefined });
    try {
      const result = await send(built, key);
      let note: string | undefined;
      if (guide.captures && result.ok) {
        const found = guide.captures.from === "id" ? (result.json as { id?: unknown } | undefined)?.id : result.headers.find(([name]) => name === guide.captures?.from)?.[1];
        if (typeof found === "string" && found) {
          guideState.setMeasurementId(found);
          note = `Measurement ${found} is kept for the next steps.`;
        }
      }
      guideState.patch(opKey, { busy: false, result, note });
    } catch (e) {
      guideState.patch(opKey, { busy: false, error: errorMessage(e), result: undefined });
    }
  };

  const code = snippets(built, guideState.baseUrl || SITE, guide.auth, guide.mode);
  const field = (f: (typeof fields)[number]) => (
    <FieldInput
      key={f.name}
      id={`${uid}-${f.name}`}
      field={f}
      value={values[f.name]}
      onChange={(value) => set(f.name, value)}
      error={built.errors[f.name]}
      warning={built.warnings[f.name]}
    />
  );

  return (
    <section className="space-y-4" data-testid={`op-${opKey}`} aria-label={guide.title}>
      <Header op={op} guide={guide} step={step} compact={compact} lead={lead} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-3">
          {followsKind(opKey) && (
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={1}
              className="flex-wrap"
              aria-label="Kind of check"
              value={[String(values.kind ?? "ping")]}
              onValueChange={(next) => {
                const preset = PRESETS.find((p) => p.id === next[0]);
                if (preset) guideState.patch(opKey, { values: { ...preset.values } });
              }}
            >
              {PRESETS.map((p) => (
                <ToggleGroupItem key={p.id} value={p.id}>
                  {p.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {primary.length === 0 && more.length === 0 && <p className="text-sm text-muted-foreground">This one takes nothing: press Send.</p>}
          {primary.map(field)}
          {filledIn && <p className="text-xs text-muted-foreground">The measurement id is the one you started in this guide. Type another to use it instead.</p>}
          {more.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2 text-xs text-muted-foreground" />}>
                More options ({more.length})
                <ChevronDownIcon />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">{more.map(field)}</CollapsibleContent>
            </Collapsible>
          )}
          <div className="space-y-1.5 pt-1">
            {guide.mode !== "stream" && (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={press} disabled={!canRun || state.busy} data-testid="send">
                  <PlayIcon /> Send
                </Button>
                {via && <span className="text-xs text-muted-foreground">{via}</span>}
              </div>
            )}
            {blocked && <p className="text-xs text-muted-foreground">This one needs an API key: paste one in the box above.</p>}
            {guide.auth === "session" && <p className="text-xs text-muted-foreground">A key cannot do this, so it is not used even when one is set.</p>}
            {built.missing.length > 0 && <p className="text-xs text-muted-foreground">Still needed: {built.missing.join(", ")}.</p>}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">curl</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="javascript">JavaScript</TabsTrigger>
            </TabsList>
            {(["curl", "python", "javascript"] as const).map((language) => (
              <TabsContent key={language} value={language}>
                <CodeBlock code={code[language]} label={language === "curl" ? "Your terminal" : language === "python" ? "Python with requests" : "JavaScript (Node 18 or a browser)"} />
              </TabsContent>
            ))}
          </Tabs>
          {guide.auth !== "none" && guide.auth !== "session" && <p className="text-xs text-muted-foreground">The snippets read your key from <code className="rounded bg-muted px-1 font-mono">IPPING_KEY</code>: it is never written into them.</p>}
          {guide.mode === "stream" ? <Watch built={built} apiKey={key} canRun={canRun} /> : <ResponseView state={state} guide={guide} />}
        </div>
      </div>
    </section>
  );
}
