import type { QuestionnaireSeed } from "./report-questionnaire";

const mc = (stableKey: string, prompt: string) => ({
  stableKey,
  prompt,
  type: "multiple_choice" as const,
  options: [
    { label: "א", value: "a" },
    { label: "ב", value: "b" },
    { label: "ג", value: "c" },
    { label: "ד", value: "d" },
  ],
  usageFlags: { matchingInput: true },
});

const open = (stableKey: string, prompt: string) => ({
  stableKey,
  prompt,
  type: "open_text" as const,
  usageFlags: { matchingInput: true },
});

const blockA = [
  "כשאתה/את מרגיש/ה כאב רגשי, מה אתה/את עושה?",
  "מה יותר מהר שובר אותך, ביקורת או התעלמות?",
  "כשמישהו/י כועס/ת עליך, מה התגובה הספונטנית שלך?",
  "מה אתה/את עושה עם קנאה כשהיא מגיעה?",
  "מה יותר קשה, לקבל סליחה או לתת אותה?",
  "כשקשה לך, האם אתה/את מבקש/ת עזרה?",
  "מה מרגיש לך יותר בטוח, לאהוב או להיות אהוב/ה?",
  "כמה פעמים נפגעת באמת בקשרים שהיו לך?",
  "האם אתה/את מאמין/ה שאפשר לאהוב שוב אחרי פגיעה גדולה?",
  "מה יותר מדויק, אתה/את אדם שנותן/ת אהבה בקלות או שמרוויח/ה אותה?",
  "האם קרה לך שאהבת מישהו/י שפגע בך שוב ושוב?",
  "מה גורם לך יותר להיסגר, כשמישהו/י צועק, בוכה, או נסגר בעצמו/ה?",
  "האם אי פעם הרגשת שאתה/את אוהב/ת יותר ממה שאוהבים אותך?",
  "כשאתה/את מאושר/ת בקשר, מה זה נראה?",
  "האם אתה/את מי שמחזיק/ה טינה?",
  "מה אתה/את עושה עם ציפיות לא מדוברות שנשברות?",
  "האם אהבה ראשונה עדיין משפיעה עליך?",
  "מה אתה/את יותר, רגשי/ת או הגיוני/ת בתוך קשר?",
  "כשאתה/את מרגיש/ה בדידות בתוך קשר, מה קורה?",
  "מה יגרום לך לרצות לעצור הכל ולהישאר?",
  "כמה מהר אתה/את נופל/ת לאהבה?",
  "מה עושה אותך פגיע/ה ביותר בקשר?",
  "האם קרה שנפרדת ממישהו/י שבאמת אהבת כי פחדת?",
  "מה הכי פוגע בגאוותך בקשר?",
  "מה יותר קל לך, לסלוח על בגידה או על שקר?",
  "האם אתה/את מי שמרגיש/ה אשמה בקלות?",
  "מה קורה לך כשבן/בת זוג זקוק/ה לך ואתה/את פשוט לא שם/ה רגשית?",
  "מה יותר מקרב אותך לאדם, שהוא/היא חלש/ה בפנייך או חזק/ה?",
  "האם אתה/את מי שמסוגל/ת לאהוב בלי לאבד את עצמו/ה?",
  "משפט שמסכם את מערכת הרגשות שלך",
];

const blockB = [
  "מה הדבר הראשון שאתה/את שם/ה לב אליו בפגישה ראשונה?",
  "מה אתה/את עושה עם שתיקה אי-נוחה?",
  "האם אתה/את אדם שמתקשר/ת הרבה בזוגיות?",
  "מה יותר קשה, לדבר על צרכים או לדבר על פחדים?",
  "האם אתה/את אומר/ת אני אוהב/ת אותך בקלות?",
  "מה מזהה אצלך שיחה טובה?",
  "אתה/את מי שמגדיר/ה גבולות בקלות?",
  "מה אתה/את עושה כשמישהו/י חוצה גבול שלך?",
  "כמה ימים של לא לדבר עם בן/בת זוג גורמים לך לחרדה?",
  "מה אתה/את עושה כשבן/בת זוג שולח/ת הודעה ולא מקבל/ת תגובה שעות?",
  "האם אתה/את שמרן/ית בבחירה של בן/בת זוג?",
  "מה יותר חשוב, כימיה פיזית או תאימות ערכים?",
  "כשאתה/את יוצא/ת לדייט, מה מרגיש אותך לפני?",
  "האם אתה/את מדמיין/ת את עצמך עם האדם השני כבר בדייט ראשון?",
  "מה אתה/את עושה אחרי דייט שלא לקח לשום מקום?",
  "מה הכי מוציא/ה אותך מאיזון בתוך קשר?",
  "מה אתה/את עושה כשמרגיש/ה בדידות בחיים?",
  "האם אי פעם הצגת עצמך אחרת ממה שאתה/את כדי שמישהו/י יאהב אותך?",
  "מה יותר קשה, להתחיל קשר חדש או לסיים אחד ישן?",
  "כמה זמן אחרי פרידה אתה/את מוכן/ה לחזור לחפש?",
  "מה אתה/את עושה עם דעות שונות על חשיבות הדברים?",
  "האם אתה/את אדם שמדבר/ת על הקשר עצמו?",
  "מה אתה/את מצפה מבן/בת זוג בזמנים קשים?",
  "האם אתה/את יכול/ה לבקש אני צריך/ה חיבוק?",
  "מה אתה/את עושה כשבן/בת זוג מסרב/ת לתת לך מה שביקשת?",
  "כמה חשוב לך שבן/בת זוג יאהב/ת את החברים שלך?",
  "מה אתה/את עושה כשהחברים/ות שלך לא אוהבים/ות את הבחירה שלך?",
  "האם אתה/את מביא/ה את העבר לתוך קשר נוכחי?",
  "מה אומר עליך שאתה/את שותק/ת בקשר?",
  "מה הכי קשה לך לקבל ממישהו/י שאתה/את אוהב/ת?",
  "האם אתה/את בוחן/ת אנשים לפני שאתה/את בוטח/ת?",
  "מה יותר קל לך, לאהוב בצורה גדולה או לאהוב בצורה יציבה?",
  "האם אתה/את מי שזוכר/ת יום הולדת, תאריכים, פרטים קטנים?",
  "מה יותר חשוב, שבן/בת זוג יהיה/תהיה שאפתן/ית או מאוזן/ת?",
  "מה בדרך כלל גורם לך לאמון לנשבר?",
];

const blockC = [
  "מה המשמעות של בית עבורך?",
  "האם אתה/את רוצה ילדים?",
  "מה הדמות שאתה/את רוצה להיות בתוך משפחה?",
  "מה חשוב לך שיהיה לך גם בזוגיות?",
  "כמה שנים אתה/את מוכן/ה לתת לקשר להתפתח לפני שאתה/את מחפש/ת מחויבות?",
  "מה אתה/את עושה כשפוגש/ת מישהו/י שמושך/ת אותך אבל לא ממש מתאים/ה?",
  "מה הדבר שאתה/את לא מוכן/ה לוותר עליו בבחירת בן/בת זוג?",
  "מה אתה/את מוכן/ה לוותר עליו כדי לבנות קשר?",
  "האם אתה/את מוכן/ה לקשר עם ילדים מנישואים קודמים?",
  "מה מוציא/ה אותך מהר ממשוואה רומנטית?",
  "האם אי פעם פגשת את הנכון/ה ופספסת?",
  "מה החלום שלך לקשר בעוד 10 שנים?",
  "מה עוצר אותך היום ממציאת זוגיות?",
  "מה אתה/את עושה שונה מהפעמים הקודמות שחיפשת?",
  "מה הסיבה האמיתית לדעתך שעד היום לא הגעת לאיפה שרצית?",
  "מה יגרום לך להגיד זה הוא/היא?",
  "האם אתה/את מסוגל/ת לבחור בצורה מודעת, לא רק מתוך כימיה?",
  "מה הדבר שאתה/את הכי פוחד/ת שיקרה בקשר הבא?",
  "מה אתה/את מציע/ה לקשר, מה הערך שלך?",
  "האם אתה/את מאמין/ה שיש זיווג, האחד?",
  "מה יותר חשוב, שיאהבו אותך כפי שאתה/את, או שתצמח/י בזכות הקשר?",
  "מה סוג הקשר שאתה/את מחפש/ת?",
  "כמה חשוב שבן/בת זוג ידע/תדע על העבר שלך?",
  "האם אתה/את מאמין/ה שאנשים יכולים לשנות?",
  "מה גורם לך להאמין שהפעם יהיה שונה?",
  "האם אתה/את מוכן/ה לעבוד על קשר גם כשקשה?",
  "מה היית אומר/ת לעצמך לפני 5 שנים על אהבה?",
  "מה תאמר/י לעצמך בעוד 5 שנים אם עוד לא מצאת?",
  "מה אתה/את רוצה שהמנגנון של lovlov ידע עליך שעדיין לא שאלנו?",
  "אם היה לך רק משפט אחד לתאר את מה שאתה/את מחפש/ת, מה הוא?",
];

const openQuestionNumbers = new Set([72, 79, 92, 93, 94, 95]);

const toQuestions = (prompts: string[], startNumber: number) =>
  prompts.map((prompt, index) => {
    const number = startNumber + index;
    const stableKey = `match_q${String(number).padStart(2, "0")}`;
    return openQuestionNumbers.has(number) ? open(stableKey, prompt) : mc(stableKey, prompt);
  });

const visualCard = (
  index: number,
  prompt: string,
  left: { label: string; value: string; image: string; alt: string; score: Record<string, number> },
  right: { label: string; value: string; image: string; alt: string; score: Record<string, number> },
) => ({
  stableKey: `visual_taste_${String(index).padStart(2, "0")}`,
  prompt,
  type: "multiple_choice" as const,
  usageFlags: { matchingInput: true, visualTaste: true },
  traitMapping: { group: "visual_taste" },
  options: [
    {
      label: left.label,
      value: left.value,
      score: {
        visual_taste: left.score,
        image: { src: left.image, alt: left.alt },
      },
    },
    {
      label: right.label,
      value: right.value,
      score: {
        visual_taste: right.score,
        image: { src: right.image, alt: right.alt },
      },
    },
    {
      label: "No preference",
      value: "skip",
      score: { visual_taste: { skip: true } },
    },
  ],
});

const visualTasteCards = [
  visualCard(1, "Which space feels more like a good first date?", { label: "Clean and quiet", value: "minimal", image: "/visual-taste/minimal-studio.svg", alt: "Minimal studio with a simple table and soft light", score: { minimal_expressive: -1 } }, { label: "Layered and expressive", value: "expressive", image: "/visual-taste/expressive-living-room.svg", alt: "Expressive living room with art, books, and color", score: { minimal_expressive: 1 } }),
  visualCard(2, "Which table setting draws you in?", { label: "Simple details", value: "simple_details", image: "/visual-taste/simple-table.svg", alt: "Simple table setting with neutral dishes", score: { minimal_expressive: -0.75 } }, { label: "Color and texture", value: "color_texture", image: "/visual-taste/colorful-table.svg", alt: "Colorful table setting with patterned dishes", score: { minimal_expressive: 0.75 } }),
  visualCard(3, "Which weekend corner fits your mood?", { label: "Open and sparse", value: "sparse", image: "/visual-taste/sparse-corner.svg", alt: "Sparse corner with one chair and open floor", score: { minimal_expressive: -0.5 } }, { label: "Collected and full", value: "collected", image: "/visual-taste/collected-corner.svg", alt: "Collected corner with shelves, plants, and objects", score: { minimal_expressive: 0.5 } }),
  visualCard(4, "Where would you rather wander together?", { label: "City evening", value: "urban", image: "/visual-taste/city-evening.svg", alt: "City street with warm shop lights", score: { urban_nature: -1 } }, { label: "Green trail", value: "nature", image: "/visual-taste/green-trail.svg", alt: "Green walking trail with trees and sunlight", score: { urban_nature: 1 } }),
  visualCard(5, "Which coffee stop feels better?", { label: "Street cafe", value: "street_cafe", image: "/visual-taste/street-cafe.svg", alt: "Street cafe exterior with small tables", score: { urban_nature: -0.75 } }, { label: "Garden bench", value: "garden_bench", image: "/visual-taste/garden-bench.svg", alt: "Garden bench beside flowers and trees", score: { urban_nature: 0.75 } }),
  visualCard(6, "Which view helps you relax?", { label: "Rooftop lights", value: "rooftop", image: "/visual-taste/rooftop-lights.svg", alt: "Rooftop view with city lights", score: { urban_nature: -0.5 } }, { label: "Quiet shore", value: "shore", image: "/visual-taste/quiet-shore.svg", alt: "Quiet shoreline with stones and water", score: { urban_nature: 0.5 } }),
  visualCard(7, "Which home feeling is closer to yours?", { label: "Soft and cozy", value: "cozy", image: "/visual-taste/cozy-room.svg", alt: "Cozy room with blankets and warm light", score: { cozy_polished: -1 } }, { label: "Refined and polished", value: "polished", image: "/visual-taste/polished-room.svg", alt: "Polished room with neat furniture and clean lines", score: { cozy_polished: 1 } }),
  visualCard(8, "Which dinner vibe feels warmer?", { label: "Casual comfort", value: "casual_comfort", image: "/visual-taste/casual-dinner.svg", alt: "Casual dinner setting with soft napkins", score: { cozy_polished: -0.75 } }, { label: "Elegant setup", value: "elegant_setup", image: "/visual-taste/elegant-dinner.svg", alt: "Elegant dinner setting with glassware and candles", score: { cozy_polished: 0.75 } }),
  visualCard(9, "Which detail would you notice first?", { label: "A familiar mug", value: "familiar_mug", image: "/visual-taste/familiar-mug.svg", alt: "Familiar mug on a wooden side table", score: { cozy_polished: -0.5 } }, { label: "A styled shelf", value: "styled_shelf", image: "/visual-taste/styled-shelf.svg", alt: "Styled shelf with arranged objects", score: { cozy_polished: 0.5 } }),
  visualCard(10, "How would you rather spend an open afternoon?", { label: "Follow the moment", value: "spontaneous", image: "/visual-taste/spontaneous-map.svg", alt: "Open map with loose notes and a camera", score: { spontaneous_curated: -1 } }, { label: "Plan the route", value: "curated", image: "/visual-taste/curated-itinerary.svg", alt: "Neat itinerary with tickets and a pen", score: { spontaneous_curated: 1 } }),
  visualCard(11, "Which weekend basket fits better?", { label: "Whatever we find", value: "whatever", image: "/visual-taste/market-finds.svg", alt: "Market finds in a casual canvas bag", score: { spontaneous_curated: -0.75 } }, { label: "Chosen in advance", value: "chosen", image: "/visual-taste/planned-picnic.svg", alt: "Planned picnic basket with arranged food", score: { spontaneous_curated: 0.75 } }),
  visualCard(12, "Which date idea feels more natural?", { label: "Unexpected stop", value: "unexpected", image: "/visual-taste/unexpected-stop.svg", alt: "Small unplanned stop with signs and lights", score: { spontaneous_curated: -0.5 } }, { label: "Reserved place", value: "reserved", image: "/visual-taste/reserved-place.svg", alt: "Reserved table with a small place card", score: { spontaneous_curated: 0.5 } }),
  visualCard(13, "Which evening feels more like you?", { label: "Quiet nook", value: "quiet", image: "/visual-taste/quiet-reading-room.svg", alt: "Quiet reading room with a lamp and books", score: { quiet_social: -1 } }, { label: "Shared table", value: "social", image: "/visual-taste/lively-dinner-table.svg", alt: "Lively dinner table with many place settings", score: { quiet_social: 1 } }),
  visualCard(14, "Which celebration feels better?", { label: "Small circle", value: "small_circle", image: "/visual-taste/small-circle.svg", alt: "Small circle of chairs around a low table", score: { quiet_social: -0.75 } }, { label: "Open gathering", value: "gathering", image: "/visual-taste/open-gathering.svg", alt: "Open gathering setup with lights and snacks", score: { quiet_social: 0.75 } }),
  visualCard(15, "Which background makes conversation easier?", { label: "Calm corner", value: "calm_corner", image: "/visual-taste/calm-corner.svg", alt: "Calm corner with two cups and low light", score: { quiet_social: -0.5 } }, { label: "Busy room", value: "busy_room", image: "/visual-taste/busy-room.svg", alt: "Busy room with music setup and snacks", score: { quiet_social: 0.5 } }),
];

export const matchingQuestionnaireSeed: QuestionnaireSeed = {
  slug: "matching-depth-v1",
  title: "שאלון עומק להתאמה ושידוך חכם",
  purpose: "matching",
  blocks: [
    {
      title: "עולם הרגשות והצללים",
      questions: toQuestions(blockA, 1),
    },
    {
      title: "דפוסי קשר ותקשורת",
      questions: toQuestions(blockB, 31),
    },
    {
      title: "חזון זוגיות ועתיד",
      questions: toQuestions(blockC, 66),
    },
    {
      title: "Visual taste",
      questions: visualTasteCards,
    },
  ],
};
