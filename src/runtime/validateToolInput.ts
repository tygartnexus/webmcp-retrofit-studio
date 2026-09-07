import type { PropertySchema, ProposedToolSchema } from "../discovery/inferGenericCapabilities";

/**
 * Strict input validation for generated tools. The schema is the contract an
 * agent was shown, so every rule in it is enforced here before any value
 * reaches a page control: plain object only, no undeclared keys, required
 * keys present, and per-property type, enum, range, length, pattern, and
 * format checks. Failures are TypeErrors with the property name.
 */

export type ToolInputValue = string | number | boolean | readonly string[];
export type ValidatedToolInput = Readonly<Record<string, ToolInputValue>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertPlainObject(input: unknown): asserts input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Tool input must be an object");
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Tool input must be a plain object");
  }
}

function readOwnDataProperty(input: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) throw new TypeError(`${key} must be an own data property`);
  return descriptor.value;
}

function compilePattern(pattern: string, key: string): RegExp {
  try {
    return new RegExp(pattern, "u");
  } catch {
    throw new TypeError(`${key} has an invalid pattern in its schema`);
  }
}

function validateNumber(key: string, value: unknown, schema: PropertySchema): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${key} must be a finite number`);
  }
  if (schema.type === "integer" && !Number.isInteger(value)) {
    throw new TypeError(`${key} must be an integer`);
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    throw new TypeError(`${key} must be at least ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    throw new TypeError(`${key} must be at most ${schema.maximum}`);
  }
  return value;
}

function validateString(key: string, value: unknown, schema: PropertySchema): string {
  if (typeof value !== "string") throw new TypeError(`${key} must be a string`);
  if (schema.enum && !schema.enum.includes(value)) {
    throw new TypeError(`${key} must be one of: ${schema.enum.join(", ")}`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    throw new TypeError(`${key} must be at most ${schema.maxLength} characters`);
  }
  if (schema.pattern && !compilePattern(schema.pattern, key).test(value)) {
    throw new TypeError(`${key} does not match the required format`);
  }
  if (schema.format === "email" && !EMAIL_PATTERN.test(value)) {
    throw new TypeError(`${key} must be an email address`);
  }
  if (schema.format === "uri" && !URL.canParse(value)) {
    throw new TypeError(`${key} must be an absolute URL`);
  }
  return value;
}

function validateArray(key: string, value: unknown, schema: PropertySchema): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${key} must be an array`);
  const allowed = schema.items?.enum ?? [];
  const items = value.map((item, index) => {
    if (typeof item !== "string") throw new TypeError(`${key}[${index}] must be a string`);
    if (!allowed.includes(item)) throw new TypeError(`${key} items must be one of: ${allowed.join(", ")}`);
    return item;
  });
  if (schema.uniqueItems && new Set(items).size !== items.length) throw new TypeError(`${key} must not repeat an item`);
  return Object.freeze(items);
}

function validateValue(key: string, value: unknown, schema: PropertySchema): ToolInputValue {
  switch (schema.type) {
    case "array":
      return validateArray(key, value, schema);
    case "boolean":
      if (typeof value !== "boolean") throw new TypeError(`${key} must be a boolean`);
      return value;
    case "number":
    case "integer":
      return validateNumber(key, value, schema);
    default:
      return validateString(key, value, schema);
  }
}

export function validateToolInput(schema: ProposedToolSchema, input: unknown): ValidatedToolInput {
  assertPlainObject(input);
  const allowed = Object.keys(schema.properties);
  const unexpected = Reflect.ownKeys(input).find(
    (key) => typeof key !== "string" || !allowed.includes(key),
  );
  if (unexpected !== undefined) {
    throw new TypeError(`Unexpected input property: ${String(unexpected)}`);
  }
  for (const key of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) throw new TypeError(`${key} is required`);
  }
  const entries = allowed
    .filter((key) => Object.prototype.hasOwnProperty.call(input, key))
    .map((key) => [key, validateValue(key, readOwnDataProperty(input, key), schema.properties[key])] as const);
  return Object.freeze(Object.fromEntries(entries));
}
