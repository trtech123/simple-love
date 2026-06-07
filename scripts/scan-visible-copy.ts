import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type VisibleCopyFinding = {
  file: string;
  line: number;
  reason: "mojibake" | "english_visible_copy";
  text: string;
};

type ScanVisibleCopyInput = {
  roots: string[];
  allowList?: string[];
};

const sourceExtensions = new Set([".ts", ".tsx"]);
const mojibakePattern = /(?:×|�|Ã|Â|â€™|â€œ|â€�|â€“|â€”|ï¿½)/;
const englishWordPattern = /[A-Za-z]{4,}/;
const jsxTextPattern = /<[A-Za-z][A-Za-z0-9.:-]*(?:\s[^>]*)?>\s*([^<>{}\n]*[A-Za-z]{4,}[^<>{}\n]*)\s*<\/[A-Za-z][A-Za-z0-9.:-]*>/g;
const visibleAttributePattern =
  /\b(?:placeholder|aria-label|title|alt)\s*=\s*(?:"([^"]*[A-Za-z]{4,}[^"]*)"|'([^']*[A-Za-z]{4,}[^']*)')/g;
const apiMessagePattern = /\bmessage\s*:\s*(?:"([^"]*[A-Za-z]{4,}[^"]*)"|'([^']*[A-Za-z]{4,}[^']*)')/g;

export async function scanVisibleCopy({
  roots,
  allowList = [],
}: ScanVisibleCopyInput): Promise<VisibleCopyFinding[]> {
  const files = (await Promise.all(roots.map((root) => collectFiles(root)))).flat().sort();
  const findings: VisibleCopyFinding[] = [];

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const lines = text.split(/\r?\n/);

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      if (mojibakePattern.test(line)) {
        findings.push({
          file: normalizePath(file),
          line: lineNumber,
          reason: "mojibake",
          text: line.trim(),
        });
      }

      for (const visibleText of collectVisibleEnglishText(line)) {
        if (!isAllowedVisibleText(visibleText, allowList)) {
          findings.push({
            file: normalizePath(file),
            line: lineNumber,
            reason: "english_visible_copy",
            text: visibleText.trim(),
          });
        }
      }
    });
  }

  return findings;
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(fullPath);
      }

      return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
    }),
  );

  return files.flat();
}

function collectVisibleEnglishText(line: string): string[] {
  return [
    ...matchCaptures(line, jsxTextPattern),
    ...matchCaptures(line, visibleAttributePattern),
    ...matchCaptures(line, apiMessagePattern),
  ].filter((text) => englishWordPattern.test(text));
}

function matchCaptures(line: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  const matches: string[] = [];
  for (const match of line.matchAll(pattern)) {
    const capture = match.slice(1).find(Boolean);
    if (capture) {
      matches.push(capture);
    }
  }
  return matches;
}

function isAllowedVisibleText(text: string, allowList: string[]): boolean {
  const trimmed = text.trim();

  return allowList.some((allowed) => trimmed.includes(allowed));
}

function normalizePath(file: string): string {
  return file.split(path.sep).join("/");
}

async function main() {
  const findings = await scanVisibleCopy({
    roots: process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["src/app", "src/components"],
  });

  if (findings.length > 0) {
    console.error(JSON.stringify(findings, null, 2));
    process.exit(1);
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  void main();
}
