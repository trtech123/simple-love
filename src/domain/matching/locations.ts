export type MatchingLocationOption = {
  key: string;
  displayText: string;
  aliases: string[];
  latitude: number;
  longitude: number;
};

export const MVP_LOCATION_OPTIONS: MatchingLocationOption[] = [
  { key: "tel-aviv", displayText: "תל אביב", aliases: ["Tel Aviv"], latitude: 32.0853, longitude: 34.7818 },
  { key: "jerusalem", displayText: "ירושלים", aliases: ["Jerusalem"], latitude: 31.7683, longitude: 35.2137 },
  { key: "haifa", displayText: "חיפה", aliases: ["Haifa"], latitude: 32.794, longitude: 34.9896 },
  { key: "beer-sheva", displayText: "באר שבע", aliases: ["Beer Sheva"], latitude: 31.2529, longitude: 34.7915 },
  { key: "netanya", displayText: "נתניה", aliases: ["Netanya"], latitude: 32.3215, longitude: 34.8532 },
  { key: "ashdod", displayText: "אשדוד", aliases: ["Ashdod"], latitude: 31.8014, longitude: 34.6435 },
  { key: "rishon-lezion", displayText: "ראשון לציון", aliases: ["Rishon LeZion"], latitude: 31.973, longitude: 34.7925 },
  { key: "petah-tikva", displayText: "פתח תקווה", aliases: ["Petah Tikva"], latitude: 32.0871, longitude: 34.8878 },
];
