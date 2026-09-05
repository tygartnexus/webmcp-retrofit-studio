import type { ProposedToolSchema } from "../src/discovery/inferGenericCapabilities";
import { sampleToolInput } from "../src/runtime/sampleInput";
import { validateToolInput } from "../src/runtime/validateToolInput";

const schema: ProposedToolSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Name", maxLength: 5 },
    email: { type: "string", description: "Email", format: "email" },
    topic: { type: "string", description: "Topic", enum: ["sales", "support"] },
    postal: { type: "string", description: "Postal", pattern: "^[0-9]{5}$" },
    site: { type: "string", description: "Site", format: "uri" },
    qty: { type: "integer", description: "Qty", minimum: 1, maximum: 10 },
    price: { type: "number", description: "Price", minimum: 0 },
    agree: { type: "boolean", description: "Agree" },
  },
  required: ["name", "topic"],
  additionalProperties: false,
};

describe("validateToolInput", () => {
  it("returns a frozen copy of valid input and ignores nothing declared", () => {
    const result = validateToolInput(schema, { name: "Ann", topic: "sales", qty: 3, agree: true });

    expect(result).toEqual({ name: "Ann", topic: "sales", qty: 3, agree: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects non-objects, arrays, and objects with foreign prototypes", () => {
    expect(() => validateToolInput(schema, "x")).toThrow(/must be an object/);
    expect(() => validateToolInput(schema, [])).toThrow(/must be an object/);
    expect(() => validateToolInput(schema, new Map())).toThrow(/plain object/);
    expect(validateToolInput(schema, Object.assign(Object.create(null), { name: "a", topic: "sales" }))).toEqual({
      name: "a",
      topic: "sales",
    });
  });

  it("rejects undeclared keys, including symbols and accessor properties", () => {
    expect(() => validateToolInput(schema, { name: "a", topic: "sales", extra: 1 })).toThrow(/Unexpected input property: extra/);
    expect(() => validateToolInput(schema, { name: "a", topic: "sales", [Symbol("s")]: 1 })).toThrow(/Unexpected/);
    const accessor = { topic: "sales" } as Record<string, unknown>;
    Object.defineProperty(accessor, "name", { get: () => "a", enumerable: true });
    expect(() => validateToolInput(schema, accessor)).toThrow(/own data property/);
  });

  it("requires required keys", () => {
    expect(() => validateToolInput(schema, { name: "a" })).toThrow(/topic is required/);
  });

  it("enforces type, enum, length, range, integer, pattern, and format rules", () => {
    const base = { name: "a", topic: "sales" };
    expect(() => validateToolInput(schema, { ...base, name: 1 })).toThrow(/name must be a string/);
    expect(() => validateToolInput(schema, { ...base, name: "toolong" })).toThrow(/at most 5 characters/);
    expect(() => validateToolInput(schema, { ...base, topic: "other" })).toThrow(/one of: sales, support/);
    expect(() => validateToolInput(schema, { ...base, qty: 1.5 })).toThrow(/integer/);
    expect(() => validateToolInput(schema, { ...base, qty: 11 })).toThrow(/at most 10/);
    expect(() => validateToolInput(schema, { ...base, price: -1 })).toThrow(/at least 0/);
    expect(() => validateToolInput(schema, { ...base, price: Number.NaN })).toThrow(/finite number/);
    expect(() => validateToolInput(schema, { ...base, postal: "12a45" })).toThrow(/required format/);
    expect(() => validateToolInput(schema, { ...base, email: "nope" })).toThrow(/email address/);
    expect(() => validateToolInput(schema, { ...base, site: "not a url" })).toThrow(/absolute URL/);
    expect(() => validateToolInput(schema, { ...base, agree: "yes" })).toThrow(/boolean/);
    expect(validateToolInput(schema, { ...base, postal: "12345", email: "a@b.co", site: "https://x.test/" })).toMatchObject({
      postal: "12345",
    });
  });

  it("treats an invalid schema pattern as a validation failure rather than accepting the value", () => {
    const broken: ProposedToolSchema = {
      type: "object",
      properties: { code: { type: "string", description: "Code", pattern: "[" } },
      additionalProperties: false,
    };
    expect(() => validateToolInput(broken, { code: "x" })).toThrow(/invalid pattern/);
  });
});

describe("sampleToolInput", () => {
  it("fills only required properties with values that pass validation", () => {
    const sample = sampleToolInput(schema);

    expect(Object.keys(sample)).toEqual(["name", "topic"]);
    expect(validateToolInput(schema, sample)).toEqual(sample);
  });

  it("derives pattern, range, and format friendly values", () => {
    const strict: ProposedToolSchema = {
      type: "object",
      properties: {
        postal: { type: "string", description: "Postal", pattern: "^[0-9]{5}$" },
        when: { type: "string", description: "Date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        at: { type: "string", description: "Time", pattern: "^\\d{2}:\\d{2}$" },
        email: { type: "string", description: "Email", format: "email" },
        qty: { type: "integer", description: "Qty", minimum: 4 },
        cap: { type: "number", description: "Cap", maximum: 0.5 },
        ok: { type: "boolean", description: "Ok" },
      },
      required: ["postal", "when", "at", "email", "qty", "cap", "ok"],
      additionalProperties: false,
    };
    const sample = sampleToolInput(strict);

    expect(sample).toEqual({
      postal: "00000",
      when: "0000-00-00",
      at: "00:00",
      email: "person@example.test",
      qty: 4,
      cap: 0.5,
      ok: true,
    });
    expect(validateToolInput(strict, sample)).toEqual(sample);
  });
});
