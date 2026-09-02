import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const PROJECT_ROOT = process.cwd();
const TEXT_EXTENSIONS = new Set([".css", ".html", ".json", ".md", ".ts", ".tsx"]);
const UNRESOLVED_MARKER =
  /\b(?:TODO|TBD|FIXME):|\{\{[^}]+\}\}|\[\[[^\]]+\]\]|<(?:insert|replace|fill)[^>]*>/i;

function listTextFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listTextFiles(path);
    return TEXT_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

describe("repository quality", () => {
  it("contains no unresolved placeholders in shipped source and documentation", () => {
    const files = [
      ...listTextFiles(join(PROJECT_ROOT, "src")),
      ...listTextFiles(join(PROJECT_ROOT, "docs")),
      join(PROJECT_ROOT, "README.md"),
      join(PROJECT_ROOT, "index.html"),
    ];

    const unresolvedFiles = files.filter((file) =>
      UNRESOLVED_MARKER.test(readFileSync(file, "utf8")),
    );

    expect(unresolvedFiles).toEqual([]);
  });
});
