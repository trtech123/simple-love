import { z } from "zod";

const longReportTextSchema = z.string().trim().min(180);
const insightListSchema = z.array(z.string().trim().min(1)).min(3);

const fullReportOutputSchema = z.object({
  title: z.string().min(1),
  openingSummary: longReportTextSchema,
  archetypeExplanation: longReportTextSchema,
  emotionalRelationshipPattern: longReportTextSchema,
  strengths: insightListSchema,
  blockers: insightListSchema,
  relationshipNeeds: insightListSchema,
  datingGuidance: insightListSchema,
  matchingGuidance: insightListSchema,
  sevenDayActionPlan: z.array(z.string().trim().min(1)).length(7),
  reflectionQuestions: insightListSchema,
  disclaimer: z.string().includes("אינו אבחון"),
});

export const reportOutputSchema = z.preprocess(normalizeLegacyReportOutput, fullReportOutputSchema);

export type ReportOutput = z.infer<typeof reportOutputSchema>;

export function validateReportOutput(value: unknown): ReportOutput {
  return reportOutputSchema.parse(value);
}

function normalizeLegacyReportOutput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.openingSummary === "string") {
    return value;
  }

  if (
    typeof record.title === "string" &&
    typeof record.profileSummary === "string" &&
    Array.isArray(record.blockers) &&
    Array.isArray(record.accelerators) &&
    Array.isArray(record.actionPlan) &&
    typeof record.disclaimer === "string"
  ) {
    const summary = enrichLegacyText(String(record.profileSummary));
    const accelerators = expandLegacyItems(record.accelerators, [
      "יכולת לזהות מה מקדם חיבור רגשי בטוח וברור יותר.",
      "נכונות להתבונן בדפוסים אישיים ולשפר את בחירת הקשרים הבאים.",
      "רגישות לאיכות התקשורת ולתחושת הדדיות בתחילת היכרות.",
    ]);
    const blockers = expandLegacyItems(record.blockers, [
      "ציפיות לא מדוברות עלולות ליצור מרחק או בלבול בתחילת קשר.",
      "חשש מאכזבה יכול להקשות על בדיקה רגועה של התאמה אמיתית.",
      "קצב לא ברור עלול לגרום לניחושים במקום לשיחה ישירה ועדינה.",
    ]);
    const actionPlan = expandLegacyItems(record.actionPlan, [
      "לכתוב צורך רגשי אחד שחשוב לבטא לפני ההיכרות הבאה.",
      "לזהות סימן אחד שמראה שהצד השני עקבי וזמין רגשית.",
      "לנסח שאלה קצרה שמבררת כוונה או קצב בלי להעמיס.",
      "לבדוק איפה את/ה מוותר/ת מהר מדי על גבול אישי.",
      "לתרגל אמירה ישירה ועדינה של העדפה או צורך.",
      "לבחור מדד אחד להתאמה שמבוסס על מעשים ולא רק על מילים.",
      "לסכם מה למדת על הקצב הנכון לך בקשר חדש.",
    ]);

    return {
      title: record.title,
      openingSummary: summary,
      archetypeExplanation:
        "הדוח המקורי נוצר לפני הרחבת מבנה הדוח, ולכן חלק זה מתרגם את הסיכום שנשמר לשפה רחבה יותר. לפי התשובות שנשמרו, הדפוס המרכזי קשור לאופן שבו את/ה בודק/ת ביטחון, הדדיות וקצב בתחילת קשר. כדאי לקרוא את החלק הזה כהזמנה להתבוננות ולא כקביעה סופית על מי שאת/ה.",
      emotionalRelationshipPattern: summary,
      strengths: accelerators,
      blockers,
      relationshipNeeds: accelerators,
      datingGuidance: actionPlan.slice(0, 3),
      matchingGuidance: accelerators,
      sevenDayActionPlan: actionPlan.slice(0, 7),
      reflectionQuestions: [
        "מה מתוך הדוח מרגיש מדויק עבורי כרגע, ומה הייתי רוצה לבדוק מחדש?",
        "איזה צורך רגשי אני רוצה לבטא בצורה ברורה יותר בהיכרות הבאה?",
        "איזה צעד קטן ומעשי יעזור לי לבחור קשר שמתאים לקצב ולביטחון שלי?",
      ],
      disclaimer: record.disclaimer.includes("אינו אבחון")
        ? record.disclaimer
        : `${record.disclaimer} הדוח אינו אבחון.`,
    };
  }

  return value;
}

function expandLegacyItems(value: unknown[], fallback: string[]) {
  const items = value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  return [...items, ...fallback].slice(0, Math.max(3, fallback.length));
}

function enrichLegacyText(summary: string) {
  return `${summary} כדי לקרוא את הדוח הישן בתוך מבנה הדוח החדש, חשוב להתייחס לסיכום הזה כנקודת פתיחה להתבוננות: מה חוזר אצלך בתחילת קשר, איפה יש צורך בביטחון ובהירות, ואילו צעדים קטנים יכולים לעזור לך לבחור חיבורים מדויקים יותר. החלק הזה נשען על התשובות שנשמרו ואינו מחליף שיחה מקצועית או היכרות חיה עם המורכבות האישית שלך.`;
}
