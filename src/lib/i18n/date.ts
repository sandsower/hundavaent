import type { Locale } from './locale';

const monthNames: Record<Locale, readonly string[]> = {
  is: [
    'janúar',
    'febrúar',
    'mars',
    'apríl',
    'maí',
    'júní',
    'júlí',
    'ágúst',
    'september',
    'október',
    'nóvember',
    'desember'
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ]
};

export function formatLocalizedDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  const day = date.getUTCDate();
  const month = monthNames[locale][date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return locale === 'is' ? `${day}. ${month} ${year}` : `${day} ${month} ${year}`;
}

export function formatLocalizedDateOnly(value: string, locale: Locale): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return formatLocalizedDate(`${value}T00:00:00.000Z`, locale);
}

export function formatLocalizedWeekRange(startsOn: string, endsOn: string, locale: Locale): string {
  if (!isDateOnly(startsOn) || !isDateOnly(endsOn)) return `${startsOn} - ${endsOn}`;

  const start = new Date(`${startsOn}T00:00:00.000Z`);
  const end = new Date(`${endsOn}T00:00:00.000Z`);
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startMonth = monthNames[locale][start.getUTCMonth()];
  const endMonth = monthNames[locale][end.getUTCMonth()];
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();

  if (locale === 'is') {
    return sameMonth
      ? `${startDay}.-${endDay}. ${endMonth}`
      : `${startDay}. ${startMonth} - ${endDay}. ${endMonth}`;
  }

  return sameMonth
    ? `${startDay}-${endDay} ${endMonth}`
    : `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
