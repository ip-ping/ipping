import type { LanguageCode } from "../languages";

import { de } from "./de";
import { en, type MessageKey } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";
import { ko } from "./ko";
import { pt } from "./pt";
import { ru } from "./ru";
import { zh } from "./zh";

/** Every language's messages; a language may leave a message out and the English one is shown. */
export const MESSAGES: Record<LanguageCode, Partial<Record<MessageKey, string>>> = { en, zh, es, fr, de, pt, ru, ja, ko };
