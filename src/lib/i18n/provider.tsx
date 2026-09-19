'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { en } from './en';
import { sq } from './sq';
import { formatDate, formatNumber, interpolate, type TranslationParams } from './index';
import type { Dictionary } from './en';
import type { Locale } from '@/lib/types';

interface I18nValue {
  locale: Locale;
  d: Dictionary;
  /** Interpolates a translated string: `t(d.exam.timeLeftValue, { days, hours })`. */
  t: (template: string, params?: TranslationParams) => string;
  date: (iso: string, withTime?: boolean) => string;
  num: (value: number, digits?: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      d: locale === 'sq' ? sq : en,
      t: (template, params) => interpolate(template, params),
      date: (iso, withTime) => formatDate(iso, locale, withTime),
      num: (n, digits) => formatNumber(n, locale, digits),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
