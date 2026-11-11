"use client";

import { Panel } from "@/components/panel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ConnectPanel } from "./connect-panel";
import { EndpointPanel } from "./endpoint-panel";
import { GROUPS, GUIDE, STEPS } from "./guide";
import { GuideProvider } from "./guide-context";
import { operation } from "./spec";

function Steps() {
  return (
    <div className="space-y-5">
      {STEPS.map((step, i) => (
        <Panel key={step.op}>
          <EndpointPanel opKey={step.op} step={i + 1} lead={step.text} />
        </Panel>
      ))}
    </div>
  );
}

function Reference() {
  return (
    <div className="space-y-8">
      {GROUPS.map((group) => (
        <section key={group.id} className="space-y-3" aria-labelledby={`group-${group.id}`}>
          <div>
            <h2 id={`group-${group.id}`} className="text-lg font-semibold">
              {group.title}
            </h2>
            <p className="text-sm text-muted-foreground">{group.intro}</p>
          </div>
          <Accordion className="rounded-xl border bg-card px-4">
            {group.ops.map((key) => {
              const op = operation(key);
              return (
                <AccordionItem key={key} value={key} data-testid={`ref-${key}`}>
                  <AccordionTrigger className="items-center gap-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge variant={op.method === "GET" ? "secondary" : "default"}>{op.method}</Badge>
                      <code className="font-mono text-xs break-all">{op.path}</code>
                      <span className="text-muted-foreground">{GUIDE[key].title}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <EndpointPanel opKey={key} compact />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </section>
      ))}
    </div>
  );
}

export function ApiGuide() {
  return (
    <GuideProvider>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">API</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Everything this site does is open to your own scripts: start a measurement, read what comes back, look an address up. Each step below has a form, a Send button
            that makes the real request, and the same request as curl, Python and JavaScript to copy.
          </p>
          <p className="max-w-3xl text-xs text-muted-foreground">
            The administration endpoints (nodes, settings, API keys, watches) are not here: they need an administrator&apos;s sign-in. Every endpoint is in the OpenAPI
            document at <a className="underline underline-offset-4" href="/api/openapi.json">/api/openapi.json</a>, and in the plain reference at{" "}
            <a className="underline underline-offset-4" href="/api/docs">/api/docs</a>.
          </p>
        </div>
        <ConnectPanel />
        <Tabs defaultValue="guide">
          <TabsList>
            <TabsTrigger value="guide">Guide</TabsTrigger>
            <TabsTrigger value="reference">Reference</TabsTrigger>
          </TabsList>
          <TabsContent value="guide" className="mt-4">
            <Steps />
          </TabsContent>
          <TabsContent value="reference" className="mt-4">
            <Reference />
          </TabsContent>
        </Tabs>
      </div>
    </GuideProvider>
  );
}
