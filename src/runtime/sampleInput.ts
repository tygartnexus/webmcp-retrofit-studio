import type { PropertySchema, ProposedToolSchema } from "../discovery/inferGenericCapabilities";
import type { ToolInputValue } from "./validateToolInput";
import { sampleFromPattern } from "./sampleFromPattern";

/**
 * Builds a minimal valid input for a tool from its own schema so the
 * deterministic checks can exercise every tool without hand-written cases.
 * Only required properties are filled. Values are obviously synthetic.
 */

const STRING_CANDIDATES = ["sample", "12345", "2026-01-15", "09:30", "person@example.test", "https://example.test/"];

function patternCandidate(pattern: string): string {
  let expression: RegExp;
  try {
    expression = new RegExp(pattern, "u");
  } catch {
    return "sample";
  }
  const generated = sampleFromPattern(pattern);
  if (generated !== null && expression.test(generated)) return generated;
  return STRING_CANDIDATES.find((candidate) => expression.test(candidate)) ?? "sample";
}

function sampleString(schema: PropertySchema): string {
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  if (schema.format === "email") return "person@example.test";
  if (schema.format === "uri") return "https://example.test/";
  const base = schema.pattern ? patternCandidate(schema.pattern) : "sample";
  return schema.maxLength !== undefined ? base.slice(0, schema.maxLength) : base;
}

function sampleNumber(schema: PropertySchema): number {
  if (schema.minimum !== undefined) return schema.minimum;
  if (schema.maximum !== undefined) return Math.min(1, schema.maximum);
  return 1;
}

export function sampleValue(schema: PropertySchema): ToolInputValue {
  switch (schema.type) {
    case "array":
      return schema.items && schema.items.enum.length > 0 ? [schema.items.enum[0]] : [];
    case "boolean":
      return true;
    case "number":
    case "integer":
      return sampleNumber(schema);
    default:
      return sampleString(schema);
  }
}

export function sampleToolInput(schema: ProposedToolSchema): Record<string, ToolInputValue> {
  const required = new Set(schema.required ?? []);
  // Optional multi-select groups are included so the array runtime path is exercised by the checks.
  const keys = Object.keys(schema.properties).filter((key) => required.has(key) || schema.properties[key].type === "array");
  return Object.fromEntries(keys.map((key) => [key, sampleValue(schema.properties[key])]));
}
