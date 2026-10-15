import voiceModel from "./voiceModel.json";

/** Languages the bundled model accepts, chosen with npm run voice:model. */
export const voiceLanguages: string[] = voiceModel.languages;
const names: Record<string, string> = { en: "English", ml: "Malayalam" };
export const voiceLanguageLabel = voiceLanguages
  .map((code) => names[code] ?? code)
  .reverse()
  .join(" or ");
