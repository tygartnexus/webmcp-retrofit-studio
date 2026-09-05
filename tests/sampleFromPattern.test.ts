import { sampleFromPattern } from "../src/runtime/sampleFromPattern";
import { sampleToolInput } from "../src/runtime/sampleInput";
import { validateToolInput } from "../src/runtime/validateToolInput";

const CASES: readonly [string, string][] = [
  ["[A-Z]{3}-[0-9]{3}", "AAA-000"],
  ["^\\d{5}(-\\d{4})?$", "00000"],
  ["^(?:abc|def)+$", "abc"],
  ["[^0-9]{2}", "aa"],
  ["\\+?[0-9 ]{7,15}", "0000000"],
  ["[a-z][a-z0-9_-]*", "a"],
  ["^\\d{4}-\\d{2}-\\d{2}$", "0000-00-00"],
  ["^\\d{2}:\\d{2}$", "00:00"],
  ["[A-Za-z]+\\.[a-z]{2,3}", "A.aa"],
  ["(\\(\\d{3}\\) )?\\d{3}-\\d{4}", "000-0000"],
];

describe("sampleFromPattern", () => {
  it.each(CASES)("derives a value that matches %s", (pattern, expected) => {
    const generated = sampleFromPattern(pattern);
    expect(generated).toBe(expected);
    expect(new RegExp(`^(?:${pattern})$`, "u").test(generated ?? "")).toBe(true);
  });

  it("returns null for unsupported or malformed syntax", () => {
    expect(sampleFromPattern("(?=a)b")).toBeNull();
    expect(sampleFromPattern("[")).toBeNull();
    expect(sampleFromPattern("a{x}")).toBeNull();
    expect(sampleFromPattern("(abc")).toBeNull();
  });

  it("feeds sampleToolInput a value the validator accepts, with anchored patterns", () => {
    const schema = {
      type: "object" as const,
      properties: {
        sku: { type: "string" as const, description: "SKU", pattern: "^(?:[A-Z]{3}-[0-9]{3})$", maxLength: 7 },
        zip: { type: "string" as const, description: "Zip", pattern: "^(?:\\d{5}(-\\d{4})?)$" },
      },
      required: ["sku", "zip"],
      additionalProperties: false as const,
    };
    const sample = sampleToolInput(schema);
    expect(sample).toEqual({ sku: "AAA-000", zip: "00000" });
    expect(validateToolInput(schema, sample)).toEqual(sample);
  });
});
