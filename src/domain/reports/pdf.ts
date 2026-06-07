import { existsSync, readFileSync } from "node:fs";
import type { ReportOutput } from "./report-output";

export type ReportPdfInput = ReportOutput & {
  reportNumber: string;
};

type PdfObject = {
  id: number;
  bytes: Buffer;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 56;
const TOP_Y = 780;
const BOTTOM_Y = 64;
const BODY_SIZE = 12;
const HEADING_SIZE = 16;

export function createReportPdfStoragePath(reportId: string, reportNumber: string) {
  const safeReportNumber = reportNumber.replace(/[^A-Za-z0-9-]/g, "-");
  return `reports/${reportId}/${safeReportNumber}.pdf`;
}

export function createReportPdfBytes(input: ReportPdfInput) {
  const pages = paginateReport(input);
  const objects: PdfObject[] = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  const cidFontId = 4;
  const descriptorId = 5;
  const fontFileId = 6;
  const toUnicodeId = 7;
  const firstPageId = 8;
  const pageIds = pages.map((_, index) => firstPageId + index * 2);
  const contentIds = pages.map((_, index) => firstPageId + index * 2 + 1);

  objects.push({ id: catalogId, bytes: ascii(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`) });
  objects.push({
    id: pagesId,
    bytes: ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`),
  });

  objects.push({
    id: fontId,
    bytes: ascii(
      `<< /Type /Font /Subtype /Type0 /BaseFont /ArialUnicode /Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`,
    ),
  });
  objects.push({
    id: cidFontId,
    bytes: ascii(
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ArialUnicode /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /CIDToGIDMap /Identity >>`,
    ),
  });
  objects.push({
    id: descriptorId,
    bytes: ascii(
      `<< /Type /FontDescriptor /FontName /ArialUnicode /Flags 4 /FontBBox [-665 -325 2000 1040] /ItalicAngle 0 /Ascent 905 /Descent -212 /CapHeight 716 /StemV 80 /FontFile2 ${fontFileId} 0 R >>`,
    ),
  });
  objects.push({ id: fontFileId, bytes: streamObject(readHebrewFontBytes(), { Length1: readHebrewFontBytes().length }) });
  objects.push({ id: toUnicodeId, bytes: streamObject(ascii(createToUnicodeCMap())) });

  for (const [index, pageLines] of pages.entries()) {
    const content = createPageContent(pageLines);
    objects.push({
      id: pageIds[index],
      bytes: ascii(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`,
      ),
    });
    objects.push({ id: contentIds[index], bytes: streamObject(content) });
  }

  return new Uint8Array(buildPdf(objects, catalogId));
}

type PdfLine = {
  text: string;
  size: number;
  y: number;
};

function paginateReport(input: ReportPdfInput): PdfLine[][] {
  const blocks: Array<{ heading?: string; body: string[] }> = [
    { body: [input.reportNumber, input.title, input.openingSummary] },
    { heading: "הארכיטיפ שלך", body: [input.archetypeExplanation] },
    { heading: "דפוס רגשי בקשר", body: [input.emotionalRelationshipPattern] },
    { heading: "חוזקות", body: input.strengths },
    { heading: "חסמים", body: input.blockers },
    { heading: "צרכים בקשר", body: input.relationshipNeeds },
    { heading: "הכוונה לדייטינג", body: input.datingGuidance },
    { heading: "הכוונה להתאמות", body: input.matchingGuidance },
    { heading: "תוכנית פעולה ל-7 ימים", body: input.sevenDayActionPlan },
    { heading: "שאלות לרפלקציה", body: input.reflectionQuestions },
    { body: [input.disclaimer] },
  ];

  const pages: PdfLine[][] = [[]];
  let y = TOP_Y;

  const addLine = (text: string, size: number) => {
    if (y < BOTTOM_Y) {
      pages.push([]);
      y = TOP_Y;
    }
    pages[pages.length - 1].push({ text, size, y });
    y -= size + 8;
  };

  for (const block of blocks) {
    if (block.heading) {
      y -= 8;
      addLine(block.heading, HEADING_SIZE);
    }
    for (const item of block.body) {
      for (const line of wrapHebrewText(item, block.heading ? 68 : 58)) {
        addLine(line, BODY_SIZE);
      }
    }
  }

  return pages;
}

function createPageContent(lines: PdfLine[]) {
  const commands = [`% ${escapePdfComment(lines[0]?.text ?? "report")}`, "BT", "/F1 12 Tf"];
  for (const line of lines) {
    commands.push(`/F1 ${line.size} Tf`);
    commands.push(`1 0 0 1 ${PAGE_WIDTH - MARGIN_X} ${line.y} Tm`);
    commands.push(`${utf16Hex(toVisualRtl(line.text))} Tj`);
  }
  commands.push("ET");
  return ascii(commands.join("\n"));
}

function escapePdfComment(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "").replace(/[\r\n]/g, " ");
}

function wrapHebrewText(value: string, maxChars: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [value];
}

function toVisualRtl(value: string) {
  return /[\u0590-\u05FF]/.test(value) ? [...value].reverse().join("") : value;
}

function utf16Hex(value: string) {
  const bytes: number[] = [0xfe, 0xff];
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0x20;
    if (code <= 0xffff) {
      bytes.push(code >> 8, code & 0xff);
    }
  }
  return `<${Buffer.from(bytes).toString("hex").toUpperCase()}>`;
}

function readHebrewFontBytes() {
  const candidates = [
    process.env.REPORT_PDF_FONT_PATH,
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
  ].filter((path): path is string => Boolean(path));
  const fontPath = candidates.find((path) => existsSync(path));

  return fontPath ? readFileSync(fontPath) : Buffer.from([]);
}

function createToUnicodeCMap() {
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}

function buildPdf(objects: PdfObject[], catalogId: number) {
  const parts: Buffer[] = [ascii("%PDF-1.7\n")];
  const offsets = new Map<number, number>();
  let length = parts[0].length;

  for (const object of objects.sort((a, b) => a.id - b.id)) {
    offsets.set(object.id, length);
    const header = ascii(`${object.id} 0 obj\n`);
    const footer = ascii("\nendobj\n");
    parts.push(header, object.bytes, footer);
    length += header.length + object.bytes.length + footer.length;
  }

  const xrefOffset = length;
  const maxId = Math.max(...objects.map((object) => object.id));
  const xref = [
    `xref`,
    `0 ${maxId + 1}`,
    "0000000000 65535 f ",
    ...Array.from({ length: maxId }, (_, index) => {
      const offset = offsets.get(index + 1) ?? 0;
      return `${String(offset).padStart(10, "0")} 00000 n `;
    }),
    `trailer`,
    `<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>`,
    `startxref`,
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  parts.push(ascii(xref));

  return Buffer.concat(parts);
}

function streamObject(bytes: Buffer, extra: Record<string, number> = {}) {
  const dictItems = Object.entries({ Length: bytes.length, ...extra })
    .map(([key, value]) => `/${key} ${value}`)
    .join(" ");
  return Buffer.concat([ascii(`<< ${dictItems} >>\nstream\n`), bytes, ascii("\nendstream")]);
}

function ascii(value: string) {
  return Buffer.from(value, "latin1");
}
