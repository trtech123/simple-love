type OptionScoreSeed = {
  visual_taste?: Record<string, unknown>;
  visualTaste?: Record<string, unknown>;
  image?: { src: string; alt: string };
  [key: string]: unknown;
};

export type QuestionSeed = {
  stableKey: string;
  prompt: string;
  type: "multiple_choice" | "scale" | "open_text";
  options?: { label: string; value: string; score?: OptionScoreSeed }[];
  usageFlags: {
    aiReportInput?: boolean;
    archetypeScoring?: boolean;
    matchingInput?: boolean;
    profileDealBreakerInput?: boolean;
    visualTaste?: boolean;
  };
  traitMapping?: Record<string, unknown>;
};

export type QuestionnaireSeed = {
  slug: string;
  title: string;
  purpose: "paid_report" | "matching";
  blocks: { title: string; questions: QuestionSeed[] }[];
};

const options = (...labels: string[]) =>
  labels.map((label, index) => ({ label, value: String.fromCharCode(97 + index) }));

export const reportQuestionnaireSeed: QuestionnaireSeed = {
  slug: "paid-report-v1",
  title: "שאלון ראשוני א",
  purpose: "paid_report",
  blocks: [
    {
      title: "שאלון אבחון אישי",
      questions: [
        { stableKey: "report_q01", prompt: "כשאתה/את נכנס/ת לקשר חדש, מה קורה אצלך ראשון?", type: "multiple_choice", options: options("נסגר/ת קצת", "נפתח/ת מיד", "מנתח/ת", "מתלהב/ת מהר ואז לפעמים מתחרט/ת"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q02", prompt: "מה יותר מפחיד אותך?", type: "multiple_choice", options: options("להידחות", "להתחייב", "להתאכזב שוב", "לפספס מישהו/י שבאמת מתאים/ה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q03", prompt: "כשמישהו/י מביע/ה אהבה, מה הכי מרגש אותך?", type: "multiple_choice", options: options("מילים", "זמן", "מגע", "מעשים"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q04", prompt: "ריב עם בן/בת זוג, מה קורה אצלך בדרך כלל?", type: "multiple_choice", options: options("נסגר/ת ושותק/ת", "צריך/ה לפתור עכשיו", "מתרגז/ת ואחר כך מצטער/ת", "מנסה להבין לפני תגובה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q05", prompt: "בחר/י את המשפט שהכי מדבר אליך", type: "multiple_choice", options: options("צריך/ה מרחב", "צריך/ה שיהיו שם תמיד", "צריך/ה שיצחיקו אותי", "צריך/ה שיאתגרו אותי"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q06", prompt: "מה מבטא אותך הכי טוב בתוך קשר?", type: "multiple_choice", options: options("הדואג/ת", "הנשען/ת", "השותף/ה", "העצמאי/ת"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q07", prompt: "מה הכי פעמים גרם לך לצאת מקשר?", type: "multiple_choice", options: options("חוסר תקשורת", "חוסר כימיה", "ערכים שונים", "תזמון לא נכון"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q08", prompt: "איזה משפט שמעת על עצמך יותר מפעם אחת?", type: "multiple_choice", options: options("יותר מדי רגיש/ה", "קצת סגור/ה", "יותר מדי עצמאי/ת", "מאוד אינטנסיבי/ת"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q09", prompt: "כשאתה/את מדמיין/ת יחסים אידיאליים, הם נראים כך", type: "multiple_choice", options: options("הכל כמעט ביחד", "לכל אחד עולם משלו", "גדלים ומאתגרים יחד", "נהנים בלי סיבוך"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q10", prompt: "איך אתה/את מגיב/ה כשבן/בת זוג צריך/ה הרבה ממך רגשית?", type: "multiple_choice", options: options("נותן/ת", "מנסה אבל מתעייף/ת", "נסגר/ת", "תלוי בצורך"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q11", prompt: "כמה זמן לוקח לך להרגיש בנוח לחשוף חולשות?", type: "multiple_choice", options: options("מהר מאוד", "כמה חודשים", "רק אחרי אמון מלא", "קשה לי עם זה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q12", prompt: "מה יותר חשוב בשלב הראשון של היכרות?", type: "multiple_choice", options: options("כימיה פיזית", "שיחה שמרגשת", "תחושת ביטחון", "צחוק ואווירה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q13", prompt: "אם היית מתאר/ת את עצמך בקשר במשפט אחד", type: "multiple_choice", options: options("נותן/ת הרבה", "קשה להשגה", "מאוד נאמן/ה", "כיפי/ת וקשה עם שגרה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q14", prompt: "מה יגרום לך לברוח מקשר שהתחיל טוב?", type: "multiple_choice", options: options("מנסים לשנות אותי", "מרגיש/ה לבד", "אין צמיחה", "אין מרחב אישי"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q15", prompt: "בסולם 1-4, כמה אתה/את בררן/ית?", type: "multiple_choice", options: options("1", "2", "3", "4"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q16", prompt: "מה קורה כשאתה/את רגיל/ה למישהו/י והוא/היא יוצא/ת מהתמונה?", type: "multiple_choice", options: options("קשה מאוד", "עצוב אבל ממשיך/ה", "מנסה להבין", "שם/ה קיר"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q17", prompt: "מה מפעיל אותך הכי הרבה במישהו/י?", type: "multiple_choice", options: options("ביטחון עצמי", "חוש הומור", "עומק ואינטליגנציה", "חמימות ועדינות"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q18", prompt: "היית עם מישהו/י שלא ממש מתאים/ה לך, למה?", type: "multiple_choice", options: options("פחדתי להיות לבד", "הייתה כימיה", "חשבתי שישתנה", "זה לא קרה לי"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q19", prompt: "מה המשמעות של מערכת יחסים בריאה עבורך?", type: "multiple_choice", options: options("בוחרים כל יום", "להיות עצמם לגמרי", "בונים עתיד ברור", "נהנים מהדרך"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q20", prompt: "מה הכי קשה לך לבקש בקשר?", type: "multiple_choice", options: options("עזרה", "מרחב", "קרבה", "שיוציאו אותי מהראש"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q21", prompt: "מה גורם לך להרגיש שמישהו/י באמת אוהב/ת אותך?", type: "multiple_choice", options: options("בוחר/ת בי שוב ושוב", "מכיר/ה אותי לעומק", "שם/ה בזמנים קשים", "גורם/ת לי לצחוק"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
        { stableKey: "report_q22", prompt: "משפט אחד שמסכם אותך עכשיו", type: "multiple_choice", options: options("מוכן/ה למצוא", "לא בטוח/ה אבל רוצה", "עברתי הרבה", "עדיין מגלה"), usageFlags: { aiReportInput: true, archetypeScoring: true } },
      ],
    },
  ],
};
