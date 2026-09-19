import { en, type Dictionary } from './en';
import { sq } from './sq';
import type { Locale } from '@/lib/types';

export type { Dictionary };
export const LOCALES: Locale[] = ['en', 'sq'];

const dictionaries: Record<Locale, Dictionary> = { en, sq };

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'sq';
}

export function dictionary(locale: string | undefined): Dictionary {
  return isLocale(locale) ? dictionaries[locale] : en;
}

export type TranslationParams = Record<string, string | number>;

/** Replaces `{name}` placeholders. Leaves unknown placeholders untouched. */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export function localeTag(locale: Locale): string {
  return locale === 'sq' ? 'sq-AL' : 'en-GB';
}

export function formatDate(iso: string, locale: Locale, withTime = false): string {
  const date = new Date(withTime ? iso : `${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatNumber(value: number, locale: Locale, digits = 1): string {
  return new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}
