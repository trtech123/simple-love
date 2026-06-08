import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFImage, PDFFont, PDFPage, rgb } from "pdf-lib";
import type { ReportOutput } from "./report-output";

export type ReportPdfInput = ReportOutput & {
  reportNumber: string;
};

type ReportBlock =
  | { kind: "text"; text: string; size: number; weight: "regular" | "bold"; color: PdfColor }
  | { kind: "spacer"; height: number }
  | { kind: "cta" };

export type ReportPdfLayout = {
  page: { width: number; height: number };
  marginX: number;
  topY: number;
  bottomY: number;
  ctaImage: { width: number; height: number };
  pages: Array<{
    blocks: Array<{ kind: "text" | "cta"; y: number; height: number }>;
    text: PdfTextLayout[];
    cta?: PdfCtaLayout;
  }>;
};

type PdfTextLayout = {
  text: string;
  visualText: string;
  x: number;
  y: number;
  width: number;
  size: number;
  weight: "regular" | "bold";
  color: PdfColor;
};

type PdfCtaLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  image: { x: number; y: number; width: number; height: number };
};

type PdfColor = {
  r: number;
  g: number;
  b: number;
};

type TextMetrics = Pick<PDFFont, "widthOfTextAtSize" | "heightAtSize">;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const TOP_Y = 784;
const BOTTOM_Y = 58;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BODY_SIZE = 11.5;
const SMALL_SIZE = 9.5;
const HEADING_SIZE = 16;
const TITLE_SIZE = 24;
const CTA_WIDTH = CONTENT_WIDTH;
const CTA_HEIGHT = 128;
const CTA_IMAGE_WIDTH = 144;
const CTA_IMAGE_HEIGHT = 96;

const TEXT = color(0.12, 0.1, 0.1);
const MUTED = color(0.42, 0.35, 0.35);
const PRIMARY = color(0.62, 0.12, 0.28);

export function createReportPdfStoragePath(reportId: string, reportNumber: string) {
  const safeReportNumber = reportNumber.replace(/[^A-Za-z0-9-]/g, "-");
  return `reports/${reportId}/${safeReportNumber}.pdf`;
}

export async function createReportPdfBytes(input: ReportPdfInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const fontBytes = asPdfBytes(readHebrewFontBytes());
  const regularFont = await pdf.embedFont(fontBytes, { subset: true });
  const boldFont = await pdf.embedFont(fontBytes, { subset: true });
  const ctaImage = await readCtaImage(pdf);
  const layout = createReportPdfLayout(input, {
    regular: regularFont,
    bold: boldFont,
  });

  for (const pageLayout of layout.pages) {
    const page = pdf.addPage([layout.page.width, layout.page.height]);
    drawPageBackground(page);

    for (const line of pageLayout.text) {
      page.drawText(line.visualText, {
        x: line.x,
        y: line.y,
        size: line.size,
        font: line.weight === "bold" ? boldFont : regularFont,
        color: rgb(line.color.r, line.color.g, line.color.b),
      });
    }

    if (pageLayout.cta) {
      drawCta(page, pageLayout.cta, ctaImage, regularFont, boldFont);
    }
  }

  return pdf.save();
}

export function createReportPdfLayout(
  input: ReportPdfInput,
  fonts: { regular: TextMetrics; bold: TextMetrics } = createApproximateFonts(),
): ReportPdfLayout {
  const pages: ReportPdfLayout["pages"] = [{ blocks: [], text: [] }];
  let y = TOP_Y;

  const currentPage = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push({ blocks: [], text: [] });
    y = TOP_Y;
  };
  const ensureSpace = (height: number) => {
    if (y - height < BOTTOM_Y) {
      newPage();
    }
  };
  const addSpacer = (height: number) => {
    y -= height;
  };
  const addText = (block: Extract<ReportBlock, { kind: "text" }>) => {
    const font = block.weight === "bold" ? fonts.bold : fonts.regular;
    const lineHeight = Math.ceil(block.size * 1.5);
    const lines = wrapTextByWidth(block.text, CONTENT_WIDTH, block.size, font);

    for (const line of lines) {
      ensureSpace(lineHeight);
      const blockY = y - lineHeight;
      const textY = blockY + Math.max(2, (lineHeight - block.size) / 2);
      const visualText = toVisualRtl(line);
      const width = Math.min(font.widthOfTextAtSize(visualText, block.size), CONTENT_WIDTH);
      const x = PAGE_WIDTH - MARGIN_X - width;
      currentPage().text.push({
        text: line,
        visualText,
        x,
        y: textY,
        width,
        size: block.size,
        weight: block.weight,
        color: block.color,
      });
      currentPage().blocks.push({ kind: "text", y: blockY, height: lineHeight });
      y -= lineHeight;
    }
  };
  const addCta = () => {
    ensureSpace(CTA_HEIGHT + 18);
    const top = y - 10;
    const cta: PdfCtaLayout = {
      x: MARGIN_X,
      y: top - CTA_HEIGHT,
      width: CTA_WIDTH,
      height: CTA_HEIGHT,
      image: {
        x: MARGIN_X + CTA_WIDTH - CTA_IMAGE_WIDTH - 16,
        y: top - CTA_IMAGE_HEIGHT - 16,
        width: CTA_IMAGE_WIDTH,
        height: CTA_IMAGE_HEIGHT,
      },
    };
    currentPage().cta = cta;
    currentPage().blocks.push({ kind: "cta", y: cta.y, height: cta.height });
    y = cta.y - 18;
  };

  for (const block of createReportBlocks(input)) {
    if (block.kind === "spacer") {
      addSpacer(block.height);
    } else if (block.kind === "cta") {
      addCta();
    } else {
      addText(block);
    }
  }

  return {
    page: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    marginX: MARGIN_X,
    topY: TOP_Y,
    bottomY: BOTTOM_Y,
    ctaImage: { width: CTA_IMAGE_WIDTH, height: CTA_IMAGE_HEIGHT },
    pages,
  };
}

function createReportBlocks(input: ReportPdfInput): ReportBlock[] {
  const blocks: ReportBlock[] = [
    textBlock("LovLov", SMALL_SIZE, "bold", PRIMARY),
    textBlock(input.reportNumber, SMALL_SIZE, "regular", MUTED),
    { kind: "spacer", height: 10 },
    textBlock(input.title, TITLE_SIZE, "bold", TEXT),
    { kind: "spacer", height: 8 },
    textBlock(input.openingSummary, BODY_SIZE, "regular", TEXT),
  ];

  for (const section of createReportSections(input)) {
    blocks.push({ kind: "spacer", height: 14 });
    blocks.push(textBlock(section.title, HEADING_SIZE, "bold", PRIMARY));
    for (const item of section.items) {
      blocks.push(textBlock(item, BODY_SIZE, "regular", TEXT));
      blocks.push({ kind: "spacer", height: 3 });
    }
  }

  blocks.push({ kind: "spacer", height: 12 });
  blocks.push(textBlock(input.disclaimer, SMALL_SIZE, "regular", MUTED));
  blocks.push({ kind: "spacer", height: 16 });
  blocks.push({ kind: "cta" });

  return blocks;
}

function createReportSections(input: ReportPdfInput) {
  return [
    { title: "הארכיטיפ שלך", items: [input.archetypeExplanation] },
    { title: "דפוס רגשי בקשר", items: [input.emotionalRelationshipPattern] },
    { title: "חוזקות", items: input.strengths.map(numbered) },
    { title: "חסמים", items: input.blockers.map(numbered) },
    { title: "צרכים בקשר", items: input.relationshipNeeds.map(numbered) },
    { title: "הכוונה לדייטינג", items: input.datingGuidance.map(numbered) },
    { title: "הכוונה להתאמות", items: input.matchingGuidance.map(numbered) },
    { title: "תוכנית פעולה ל-7 ימים", items: input.sevenDayActionPlan.map(numbered) },
    { title: "שאלות לרפלקציה", items: input.reflectionQuestions.map(numbered) },
  ];
}

function numbered(item: string, index: number) {
  return `${index + 1}. ${item}`;
}

function textBlock(text: string, size: number, weight: "regular" | "bold", colorValue: PdfColor): ReportBlock {
  return { kind: "text", text, size, weight, color: colorValue };
}

function wrapTextByWidth(value: string, maxWidth: number, size: number, font: TextMetrics) {
  const paragraphs = value.split(/\r?\n/);
  const lines = paragraphs.flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, size, font));
  return lines.length ? lines : [""];
}

function wrapParagraph(value: string, maxWidth: number, size: number, font: TextMetrics) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (measureVisualText(next, size, font) <= maxWidth) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (measureVisualText(word, size, font) <= maxWidth) {
      current = word;
      continue;
    }

    const splitWords = splitLongWord(word, maxWidth, size, font);
    lines.push(...splitWords.slice(0, -1));
    current = splitWords.at(-1) ?? "";
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [value];
}

function splitLongWord(word: string, maxWidth: number, size: number, font: TextMetrics) {
  const parts: string[] = [];
  let current = "";

  for (const char of [...word]) {
    const next = `${current}${char}`;
    if (current && measureVisualText(next, size, font) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function measureVisualText(value: string, size: number, font: TextMetrics) {
  return font.widthOfTextAtSize(toVisualRtl(value), size);
}

function toVisualRtl(value: string) {
  return /[\u0590-\u05FF]/.test(value) ? [...value].reverse().join("") : value;
}

function drawPageBackground(page: PDFPage) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: rgb(0.995, 0.985, 0.975),
  });
}

function drawCta(page: PDFPage, cta: PdfCtaLayout, image: PDFImage, regularFont: PDFFont, boldFont: PDFFont) {
  page.drawRectangle({
    x: cta.x,
    y: cta.y,
    width: cta.width,
    height: cta.height,
    color: rgb(0.99, 0.94, 0.91),
    borderColor: rgb(0.86, 0.72, 0.72),
    borderWidth: 1,
  });
  page.drawImage(image, {
    x: cta.image.x,
    y: cta.image.y,
    width: cta.image.width,
    height: cta.image.height,
  });

  const textRight = cta.image.x - 20;
  const textWidth = textRight - cta.x - 18;
  drawRightAlignedText(page, "השלב הבא", textRight, cta.y + cta.height - 30, textWidth, 9, boldFont, PRIMARY);
  drawRightAlignedText(
    page,
    "להפוך את התובנה להתאמות",
    textRight,
    cta.y + cta.height - 54,
    textWidth,
    15,
    boldFont,
    TEXT,
  );
  drawRightAlignedText(
    page,
    "המשך להתאמות   |   אימייל   |   WhatsApp",
    textRight,
    cta.y + 28,
    textWidth,
    10.5,
    regularFont,
    PRIMARY,
  );
}

function drawRightAlignedText(
  page: PDFPage,
  value: string,
  rightX: number,
  y: number,
  maxWidth: number,
  size: number,
  font: PDFFont,
  colorValue: PdfColor,
) {
  const visualText = toVisualRtl(value);
  const width = Math.min(font.widthOfTextAtSize(visualText, size), maxWidth);
  page.drawText(visualText, {
    x: rightX - width,
    y,
    size,
    font,
    color: rgb(colorValue.r, colorValue.g, colorValue.b),
  });
}

async function readCtaImage(pdf: PDFDocument) {
  const imagePath = path.join(process.cwd(), "public", "landing-couple.png");
  const bytes = asPdfBytes(readFileSync(imagePath));
  return pdf.embedPng(bytes);
}

function readHebrewFontBytes() {
  const candidates = [
    process.env.REPORT_PDF_FONT_PATH,
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/seguiemj.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
  ].filter((candidate): candidate is string => Boolean(candidate));
  const fontPath = candidates.find((candidate) => existsSync(candidate));

  if (!fontPath) {
    throw new Error("No Hebrew-capable font found for report PDF generation");
  }

  return readFileSync(fontPath);
}

function createApproximateFonts(): { regular: TextMetrics; bold: TextMetrics } {
  const regular = createApproximateFont(0.55);
  return {
    regular,
    bold: createApproximateFont(0.59),
  };
}

function createApproximateFont(widthFactor: number): TextMetrics {
  return {
    widthOfTextAtSize(text: string, size: number) {
      return [...text].reduce((total, char) => total + approximateCharWidth(char, size, widthFactor), 0);
    },
    heightAtSize(size: number) {
      return size;
    },
  };
}

function approximateCharWidth(char: string, size: number, widthFactor: number) {
  if (/\s/.test(char)) {
    return size * 0.28;
  }
  if (/[ilI.,:|]/.test(char)) {
    return size * 0.24;
  }
  if (/[\u0590-\u05FF]/.test(char)) {
    return size * 0.52;
  }
  return size * widthFactor;
}

function color(r: number, g: number, b: number): PdfColor {
  return { r, g, b };
}

function asPdfBytes(bytes: Buffer) {
  return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
