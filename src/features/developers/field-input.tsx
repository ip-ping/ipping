"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { Rich } from "./code";
import type { Field, Schema } from "./spec";

const UNSET = "__default__";

/** What a schema says about its values, in a few words: the type, its range and its default. */
export function hint(schema: Schema): string {
  const parts: string[] = [];
  if (schema.type === "integer") parts.push("whole number");
  else if (schema.type === "number") parts.push("number");
  else if (schema.type === "array") parts.push("list, separated by commas");
  else if (schema.type === "object") parts.push("JSON");
  if (schema.minimum !== undefined && schema.maximum !== undefined) parts.push(`${schema.minimum} to ${schema.maximum}`);
  else if (schema.maximum !== undefined) parts.push(`at most ${schema.maximum}`);
  else if (schema.minimum !== undefined) parts.push(`at least ${schema.minimum}`);
  if (schema.type === "string" && !schema.enum && schema.maxLength) parts.push(`up to ${schema.maxLength} characters`);
  if (schema.default !== undefined && schema.default !== null) parts.push(`default ${String(schema.default)}`);
  return parts.join(" · ");
}

export function FieldInput({
  id,
  field,
  value,
  onChange,
  error,
  warning,
}: {
  id: string;
  field: Field;
  value: string | boolean | undefined;
  onChange: (value: string | boolean | undefined) => void;
  error?: string;
  warning?: string;
}) {
  const { schema } = field;
  const label = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <Label htmlFor={id} className="font-mono text-xs">
        {field.name}
      </Label>
      {field.required && <Badge variant="outline">required</Badge>}
      <span className="text-xs text-muted-foreground">{hint(schema)}</span>
    </div>
  );
  const help = field.description ? <Rich text={field.description} className="block text-xs text-muted-foreground" /> : null;
  const problem = error ? <p className="text-xs text-destructive">{error}</p> : warning ? <p className="text-xs text-muted-foreground">{warning} It is sent as it is, so you can see the answer.</p> : null;

  if (schema.type === "boolean") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Switch id={id} checked={typeof value === "boolean" ? value : Boolean(schema.default)} onCheckedChange={(checked) => onChange(checked)} />
          {label}
        </div>
        {help}
        {problem}
      </div>
    );
  }

  let control;
  if (schema.enum) {
    const choices = [{ value: UNSET, label: schema.default !== undefined ? `default (${String(schema.default)})` : "default" }, ...schema.enum.map((v) => ({ value: v, label: v }))];
    control = (
      <Select value={typeof value === "string" && value ? value : UNSET} items={choices} onValueChange={(next) => next !== null && onChange(next === UNSET ? undefined : next)}>
        <SelectTrigger id={id} className="w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (schema.type === "object") {
    control = <Textarea id={id} className="font-mono text-xs" rows={3} spellCheck={false} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const numeric = schema.type === "integer" || schema.type === "number";
    control = (
      <Input
        id={id}
        className={numeric ? "w-full sm:w-40" : undefined}
        inputMode={numeric ? "numeric" : undefined}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        value={typeof value === "string" ? value : ""}
        placeholder={schema.default !== undefined && schema.default !== null ? String(schema.default) : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {label}
      {control}
      {help}
      {problem}
    </div>
  );
}
