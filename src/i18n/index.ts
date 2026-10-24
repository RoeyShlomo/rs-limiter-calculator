import { en, TranslationKey } from './en';
import { he } from './he';

export type Lang = 'he' | 'en';
export type { TranslationKey };

export const DICTS: Record<Lang, Record<TranslationKey, string>> = {
  en: en as unknown as Record<TranslationKey, string>,
  he,
};

export const DIRECTION: Record<Lang, 'rtl' | 'ltr'> = { he: 'rtl', en: 'ltr' };

export function translate(lang: Lang, key: TranslationKey): string {
  return DICTS[lang][key] ?? DICTS.en[key] ?? key;
}
