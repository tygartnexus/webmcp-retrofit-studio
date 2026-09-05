/**
 * Best-effort string generation from the regular-expression subset that HTML
 * `pattern` attributes use in practice: literals, escapes, character classes
 * with ranges, groups, alternation, and quantifiers. Unsupported syntax
 * returns null and the caller falls back to fixed candidates. The caller
 * always verifies the result against the real RegExp before using it.
 */

const CLASS_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  d: "0",
  D: "a",
  w: "a",
  W: "-",
  s: " ",
  S: "a",
});

const NEGATED_CANDIDATES = ["a", "0", "-", "_", " ", "Z"];

class PatternWalker {
  private index = 0;

  constructor(private readonly source: string) {}

  generate(): string | null {
    const result = this.alternation();
    return result !== null && this.index === this.source.length ? result : null;
  }

  private peek(offset = 0): string {
    return this.source[this.index + offset] ?? "";
  }

  private alternation(): string | null {
    const first = this.sequence();
    if (first === null) return null;
    while (this.peek() === "|") {
      this.index += 1;
      if (this.sequence() === null) return null;
    }
    return first;
  }

  private sequence(): string | null {
    let out = "";
    while (this.index < this.source.length && this.peek() !== ")" && this.peek() !== "|") {
      const char = this.peek();
      if (char === "^" || char === "$") {
        this.index += 1;
        continue;
      }
      const atom = this.atom();
      if (atom === null) return null;
      const count = this.quantifier();
      if (count === null) return null;
      out += atom.repeat(count);
    }
    return out;
  }

  private atom(): string | null {
    const char = this.peek();
    if (char === "(") return this.group();
    if (char === "[") return this.characterClass();
    if (char === "\\") return this.escape();
    if (char === ".") {
      this.index += 1;
      return "a";
    }
    if (char === "*" || char === "+" || char === "?" || char === "{") return null;
    this.index += 1;
    return char;
  }

  private group(): string | null {
    this.index += 1;
    if (this.peek() === "?") {
      if (this.peek(1) !== ":") return null;
      this.index += 2;
    }
    const inner = this.alternation();
    if (inner === null || this.peek() !== ")") return null;
    this.index += 1;
    return inner;
  }

  private escape(): string | null {
    this.index += 1;
    const escaped = this.peek();
    if (escaped === "") return null;
    this.index += 1;
    if (escaped === "b" || escaped === "B") return "";
    return CLASS_ESCAPES[escaped] ?? escaped;
  }

  private characterClass(): string | null {
    const start = this.index;
    this.index += 1;
    const negated = this.peek() === "^";
    if (negated) this.index += 1;
    let first: string | null = null;
    while (this.index < this.source.length && this.peek() !== "]") {
      let candidate = this.peek();
      if (candidate === "\\") {
        this.index += 1;
        const escaped = this.peek();
        if (escaped === "") return null;
        candidate = CLASS_ESCAPES[escaped] ?? escaped;
      }
      this.index += 1;
      if (this.peek() === "-" && this.peek(1) !== "]" && this.peek(1) !== "") this.index += 2;
      if (first === null) first = candidate;
    }
    if (this.peek() !== "]") return null;
    this.index += 1;
    if (!negated) return first;
    const classText = this.source.slice(start, this.index);
    try {
      const expression = new RegExp(classText, "u");
      return NEGATED_CANDIDATES.find((candidate) => expression.test(candidate)) ?? null;
    } catch {
      return null;
    }
  }

  private quantifier(): number | null {
    const char = this.peek();
    let count = 1;
    if (char === "*" || char === "?") count = 0;
    else if (char === "+") count = 1;
    else if (char === "{") {
      const close = this.source.indexOf("}", this.index);
      if (close < 0) return null;
      const body = this.source.slice(this.index + 1, close);
      const match = /^(\d+)(?:,(\d*))?$/.exec(body);
      if (!match) return null;
      count = Number(match[1]);
      this.index = close;
    } else {
      return 1;
    }
    this.index += 1;
    if (this.peek() === "?") this.index += 1;
    return count;
  }
}

export function sampleFromPattern(pattern: string): string | null {
  try {
    return new PatternWalker(pattern).generate();
  } catch {
    return null;
  }
}
