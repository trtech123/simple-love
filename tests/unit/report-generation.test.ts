import { describe, expect, it } from "vitest";
import { generatePaidReport } from "../../src/domain/reports/generation";
import {
  createReportPdfBytes,
  createReportPdfLayout,
  createReportPdfStoragePath,
} from "../../src/domain/reports/pdf";
import { assembleReportPrompt } from "../../src/domain/reports/prompt";
import { validateReportOutput } from "../../src/domain/reports/report-output";

describe("report generation", () => {
  it("injects answer and archetype variables into prompt template", () => {
    const prompt = assembleReportPrompt({
      template: "name: {{displayName}}\narchetype: {{archetypeName}}\nanswers: {{answersJson}}",
      displayName: "Roni",
      archetypeName: "Warm closer",
      answers: [{ question: "What scares you?", answer: "Being disappointed again" }],
    });

    expect(prompt).toContain("name: Roni");
    expect(prompt).toContain("Warm closer");
    expect(prompt).toContain("Being disappointed again");
  });

  it("accepts rich report output with substantive sections", () => {
    const result = validateReportOutput(createRichReportOutput());

    expect(result.title).toBe("דוח עומק זוגי");
    expect(result.relationshipNeeds).toHaveLength(3);
    expect(result.sevenDayActionPlan).toHaveLength(7);
  });

  it("rejects one-item insight lists", () => {
    expect(() =>
      validateReportOutput({
        ...createRichReportOutput(),
        blockers: ["חשש מאכזבה"],
      }),
    ).toThrow();
  });

  it("rejects a short seven-day action plan", () => {
    expect(() =>
      validateReportOutput({
        ...createRichReportOutput(),
        sevenDayActionPlan: [
          "יום 1: לכתוב צורך אחד שחוזר בתחילת קשר.",
          "יום 2: לשאול שאלה אחת שמבררת זמינות רגשית.",
          "יום 3: לבדוק איזה קצב מרגיש בטוח ולא מאולץ.",
        ],
      }),
    ).toThrow();
  });

  it("rejects too-short long-form report sections", () => {
    expect(() =>
      validateReportOutput({
        ...createRichReportOutput(),
        openingSummary: "סיכום קצר מדי.",
      }),
    ).toThrow();
  });

  it("persists failed report generation without creating a claim token", async () => {
    const writes: string[] = [];

    await expect(
      generatePaidReport(
        {
          async getReportInput() {
            return {
              quizSessionId: "session-1",
              promptVersionId: "prompt-1",
              archetypeVersionId: "arch-1",
              template: "{{displayName}} {{archetypeName}} {{answersJson}}",
              model: "test-model",
              modelSettings: {},
              displayName: "guest",
              archetypeName: "warm closer",
              answers: [{ question: "q", answer: "a" }],
            };
          },
          async createGeneratingReport() {
            writes.push("generating");
            return { reportId: "report-1", reportNumber: "LL-000001" };
          },
          async completeReport() {
            writes.push("completed");
          },
          async failReport(_reportId, message) {
            writes.push(`failed:${message}`);
          },
          async createClaimToken() {
            writes.push("claim");
            return "claim-token";
          },
        },
        {
          quizSessionId: "session-1",
          generateText: async () => ({ nope: true }),
        },
      ),
    ).rejects.toThrow();

    expect(writes).toEqual(["generating", expect.stringMatching(/^failed:/)]);
  });

  it("creates deterministic PDF bytes and storage path for a completed report", async () => {
    const pdf = await createReportPdfBytes({
      ...createRichReportOutput(),
      reportNumber: "LL-2026-ABCDEF12",
    });

    expect(Buffer.from(pdf.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    expect(Buffer.from(pdf).length).toBeGreaterThan(200000);
    expect(createReportPdfStoragePath("report-1", "LL-2026-ABCDEF12")).toBe(
      "reports/report-1/LL-2026-ABCDEF12.pdf",
    );
  });

  it("keeps measured PDF text and CTA media inside page margins", () => {
    const layout = createReportPdfLayout({
      ...createRichReportOutput(),
      openingSummary:
        "זהו משפט עברי ארוך במיוחד שנועד לבדוק שבירת שורות לפי רוחב אמיתי ולא לפי ספירת תווים בלבד. ".repeat(10),
      reportNumber: "LL-2026-ABCDEF12",
    });
    const pageRight = layout.page.width - layout.marginX;

    for (const page of layout.pages) {
      for (const block of page.blocks) {
        expect(block.y).toBeGreaterThanOrEqual(layout.bottomY);
        expect(block.y + block.height).toBeLessThanOrEqual(layout.topY);
      }

      for (const text of page.text) {
        expect(text.x).toBeGreaterThanOrEqual(layout.marginX);
        expect(text.x + text.width).toBeLessThanOrEqual(pageRight + 0.01);
        expect(text.y).toBeGreaterThanOrEqual(layout.bottomY);
        expect(text.y).toBeLessThanOrEqual(layout.topY);
        expect(text.x).toBeLessThan(pageRight);
      }
    }

    expect(layout.ctaImage.width).toBeLessThanOrEqual(150);
    expect(layout.ctaImage.height).toBeLessThanOrEqual(100);
    expect(layout.pages.at(-1)?.blocks.some((block) => block.kind === "cta")).toBe(true);
  });
});

function createRichReportOutput() {
  return {
    title: "דוח עומק זוגי",
    openingSummary:
      "מהתשובות שלך עולה תמונה של אדם שמחפש קשר שיש בו גם חום וגם בהירות. יש בך רצון להתקרב, אבל לא בכל מחיר: חשוב לך להרגיש שהצד השני עקבי, קשוב ומסוגל לדבר בכנות על מה שקורה ביניכם. הדוח הזה מתמקד בדפוסים שחוזרים אצלך בתחילת היכרות ובצעדים קטנים שיעזרו לך לבחור קשרים בטוחים ומדויקים יותר.",
    archetypeExplanation:
      "הארכיטיפ שלך מתאר נטייה להתחבר דרך עומק רגשי, התבוננות ומבחן עדין של אמינות. כאשר יש סימנים של יציבות, את/ה מסוגל/ת להביא הרבה רוך ונוכחות. כאשר התקשורת עמומה או לא עקבית, עשוי להתעורר צורך לבדוק שוב ושוב אם הקשר באמת מתקדם. זו אינה חולשה, אלא דרך להגן על צורך אמיתי בביטחון.",
    emotionalRelationshipPattern:
      "בדינמיקה זוגית עשויה להופיע תנועה בין רצון לקרבה לבין עצירה פנימית כשאין מספיק ודאות. בתחילת קשר את/ה יכול/ה להתרגש במהירות מהבטחה רגשית, ואז להאט כשהמעשים אינם תואמים את המילים. הדפוס המרכזי הוא ללמוד להבחין בין זהירות בריאה לבין ויתור מוקדם, ולבקש בהירות לפני שהלב מתחיל לנחש לבד.",
    strengths: [
      "יכולת גבוהה לזהות ניואנסים רגשיים ולשים לב לאיכות התקשורת כבר בשלבים הראשונים.",
      "נכונות להשקיע בקשר שיש בו עומק, הדדיות ורצון אמיתי להכיר מעבר לרושם הראשוני.",
      "רגישות לצרכים של הצד השני לצד רצון לבנות מרחב שבו אפשר לדבר בכנות על גבולות וציפיות.",
    ],
    blockers: [
      "ציפיות שלא נאמרות בקול עלולות להפוך למבחנים שקטים שהצד השני לא יודע שהוא עובר.",
      "חשש מאכזבה יכול לגרום לך לפרש איחור בתגובה או עמימות קטנה כסימן גדול מדי לחוסר התאמה.",
      "נטייה לתת עוד הזדמנות בלי לבקש בהירות עלולה להאריך קשרים שלא באמת נותנים לך ביטחון.",
    ],
    relationshipNeeds: [
      "תקשורת עקבית שמראה עניין דרך מעשים פשוטים ולא רק דרך מילים יפות בתחילת ההיכרות.",
      "קצב התקרבות שמאפשר התרגשות, אבל משאיר מקום לבדוק התאמה בלי לחץ להחליט מיד.",
      "יכולת לדבר על גבולות, זמינות וציפיות בלי שהשיחה תהפוך להאשמה או לדרמה.",
    ],
    datingGuidance: [
      "לפני דייט או שיחה משמעותית, נסח/י לעצמך צורך אחד שחשוב לך לבדוק במקום לחכות שהצד השני ינחש.",
      "כאשר משהו מרגיש עמום, שאל/י שאלה קצרה וישירה על הקצב או הכוונה במקום לבנות סיפור פנימי.",
      "שים/י לב להתאמה בין מילים למעשים לאורך כמה ימים, ולא רק לעוצמת החיבור בשיחה אחת טובה.",
    ],
    matchingGuidance: [
      "כדאי לחפש אנשים שמראים יציבות רגשית דרך עקביות, זמינות ושפה מכבדת גם כשהקצב איטי.",
      "התאמה טובה עבורך תכלול אדם שמסוגל לענות בכנות על שאלות עדינות בלי להיעלם או להתגונן.",
      "פחות מתאים להישען על חיבור שמרגיש סוער מאוד בהתחלה אבל לא מצליח לייצר בהירות בסיסית.",
    ],
    sevenDayActionPlan: [
      "יום 1: לכתוב שלושה סימנים שמייצרים אצלך ביטחון בקשר חדש ולסמן איזה מהם הכי חסר לאחרונה.",
      "יום 2: לנסח משפט קצר שמבטא צורך רגשי אחד בלי התנצלות ובלי להפוך אותו לדרישה.",
      "יום 3: לבדוק קשר אחד מהעבר ולזהות איפה הייתה בהירות אמיתית ואיפה השלמת לבד פערים.",
      "יום 4: לתרגל שאלה אחת על קצב ההיכרות שאפשר לשאול בדייט או בצ'אט בלי להעמיס.",
      "יום 5: לבחור גבול קטן אחד שחשוב לך לשמור עליו בתחילת קשר, כמו זמינות או סגנון דיבור.",
      "יום 6: לשים לב למקום שבו את/ה ממהר/ת לפרש ולהחליף פרשנות אחת בבקשת הבהרה פשוטה.",
      "יום 7: לסכם מה למדת השבוע על הקצב הנכון לך ומה תרצה/י לקחת להיכרות הבאה.",
    ],
    reflectionQuestions: [
      "מה גורם לי להרגיש בטוח/ה בתחילת קשר, ואיך אני יכול/ה לבקש את זה בצורה פשוטה יותר?",
      "איפה אני נוטה לבדוק את הצד השני במקום להגיד בקול מה אני צריך/ה להבין?",
      "איזה סימן קטן יראה לי שהקשר הבא מתקדם בצורה רגועה, הדדית ובריאה יותר עבורי?",
    ],
    disclaimer: "הדוח נועד לרפלקציה אישית בלבד ואינו אבחון.",
  };
}
