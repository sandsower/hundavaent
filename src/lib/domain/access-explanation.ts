import type { AccessCondition } from './access';
import type { Locale } from '$i18n';
import { formatLocalizedDateOnly } from '$i18n/date';

export function explainAccessCondition(condition: AccessCondition, locale: Locale): string {
  if (locale === 'is') return explainIcelandic(condition);
  return explainEnglish(condition);
}

function explainEnglish(condition: AccessCondition): string {
  const subject = eligibilityEnglish(condition);
  const area = areaEnglish(condition);
  const availability = availabilityEnglish(condition);
  const restraint = restraintEnglish(condition);
  const permission = permissionEnglish(condition);
  const unknownAvailability = hasKnownAvailability(condition) ? '' : ' Access times are unknown.';

  return `${subject} ${permission} ${area}${availability}${restraint}.${unknownAvailability}`;
}

function explainIcelandic(condition: AccessCondition): string {
  const subject = eligibilityIcelandic(condition);
  const area = areaIcelandic(condition);
  const availability = availabilityIcelandic(condition);
  const restraint = restraintIcelandic(condition);
  const permission = permissionIcelandic(condition);
  const unknownAvailability = hasKnownAvailability(condition) ? '' : ' Aðgangstímar eru óþekktir.';

  return `${subject} ${permission} ${area}${availability}${restraint}.${unknownAvailability}`;
}

function eligibilityEnglish(condition: AccessCondition): string {
  const eligibility = condition.dogEligibility;
  if (eligibility.scope === 'all_dogs') return 'All dogs';
  const restrictions: string[] = [];
  if (eligibility.maximumWeightKg !== undefined)
    restrictions.push(
      `weighing up to and including ${formatNumber(eligibility.maximumWeightKg, 'en')} kg`
    );
  if (eligibility.maximumDogs !== undefined)
    restrictions.push(
      `limited to ${eligibility.maximumDogs} ${eligibility.maximumDogs === 1 ? 'dog' : 'dogs'}`
    );
  if (eligibility.notes) restrictions.push(`matching this restriction: ${eligibility.notes}`);
  return restrictions.length > 0 ? `Dogs ${joinRestrictions(restrictions)}` : 'Eligible dogs';
}

function eligibilityIcelandic(condition: AccessCondition): string {
  const eligibility = condition.dogEligibility;
  if (eligibility.scope === 'all_dogs') return 'Allir hundar';
  const restrictions: string[] = [];
  if (eligibility.maximumWeightKg !== undefined)
    restrictions.push(
      `sem eru allt að og með ${formatNumber(eligibility.maximumWeightKg, 'is')} kg`
    );
  if (eligibility.maximumDogs !== undefined)
    restrictions.push(
      `að hámarki ${eligibility.maximumDogs} ${eligibility.maximumDogs === 1 ? 'hundur' : 'hundar'}`
    );
  if (eligibility.notes) restrictions.push(`sem uppfylla skilyrðið: ${eligibility.notes}`);
  return restrictions.length > 0
    ? `Hundar ${joinRestrictions(restrictions, 'og')}`
    : 'Hundar sem uppfylla skilyrði';
}

function areaEnglish(condition: AccessCondition): string {
  const area =
    condition.accessArea === 'indoors'
      ? 'indoors'
      : condition.accessArea === 'outdoors'
        ? 'outdoors'
        : condition.accessArea === 'designated_area'
          ? 'in the designated area'
          : 'in the stated bounded area';
  return condition.accessAreaNote ? `${area} (${condition.accessAreaNote})` : area;
}

function areaIcelandic(condition: AccessCondition): string {
  const area =
    condition.accessArea === 'indoors'
      ? 'innandyra'
      : condition.accessArea === 'outdoors'
        ? 'utandyra'
        : condition.accessArea === 'designated_area'
          ? 'á afmörkuðu svæði'
          : 'á tilgreindu afmörkuðu svæði';
  return condition.accessAreaNote ? `${area} (${condition.accessAreaNote})` : area;
}

function restraintEnglish(condition: AccessCondition): string {
  const restraint =
    condition.restraintCondition === 'leash_required'
      ? ' on a leash'
      : condition.restraintCondition === 'off_leash_permitted'
        ? ' off leash'
        : condition.restraintCondition === 'carrier_required'
          ? ' when carried'
          : ' under the sourced control rule';
  return condition.restraintNote ? `${restraint} (${condition.restraintNote})` : restraint;
}

function restraintIcelandic(condition: AccessCondition): string {
  const restraint =
    condition.restraintCondition === 'leash_required'
      ? ' í taumi'
      : condition.restraintCondition === 'off_leash_permitted'
        ? ' án taums'
        : condition.restraintCondition === 'carrier_required'
          ? ' í burðartösku'
          : ' samkvæmt tilgreindri aðhaldsreglu';
  return condition.restraintNote ? `${restraint} (${condition.restraintNote})` : restraint;
}

function permissionEnglish(condition: AccessCondition): string {
  if (condition.permissionRequirement === 'standing_permission') return 'are allowed';
  if (condition.permissionRequirement === 'ask_on_arrival')
    return 'may be allowed after asking on arrival';
  return 'may be allowed with advance approval';
}

function permissionIcelandic(condition: AccessCondition): string {
  if (condition.permissionRequirement === 'standing_permission') return 'mega vera';
  if (condition.permissionRequirement === 'ask_on_arrival')
    return 'gætu fengið að vera eftir að spurt er við komu';
  return 'gætu fengið að vera með leyfi fyrirfram';
}

function availabilityEnglish(condition: AccessCondition): string {
  const window = condition.availabilityWindow;
  const days = window.days?.length
    ? ` on ${joinList(window.days.map((day) => weekdayNames.en[day]))}`
    : '';
  const season = seasonalEnglish(window.startsOn, window.endsOn);
  const note = window.notes ? ` when ${window.notes}` : '';
  if (window.startsAt && window.endsAt)
    return `${days} from ${window.startsAt} to ${window.endsAt}${note}${season}`;
  if (window.startsAt) return `${days} after ${window.startsAt}${note}${season}`;
  if (window.endsAt) return `${days} before ${window.endsAt}${note}${season}`;
  if (window.notes) return `${days}${note}${season}`;
  return `${days}${season}`;
}

function availabilityIcelandic(condition: AccessCondition): string {
  const window = condition.availabilityWindow;
  const days = window.days?.length
    ? ` á ${joinList(window.days.map((day) => weekdayNames.is[day]))}`
    : '';
  const season = seasonalIcelandic(window.startsOn, window.endsOn);
  const note = window.notes ? ` þegar ${window.notes}` : '';
  if (window.startsAt && window.endsAt)
    return `${days} frá kl. ${window.startsAt} til ${window.endsAt}${note}${season}`;
  if (window.startsAt) return `${days} eftir kl. ${window.startsAt}${note}${season}`;
  if (window.endsAt) return `${days} fyrir kl. ${window.endsAt}${note}${season}`;
  if (window.notes) return `${days}${note}${season}`;
  return `${days}${season}`;
}

function hasKnownAvailability(condition: AccessCondition): boolean {
  return Object.keys(condition.availabilityWindow).length > 0;
}

function formatNumber(value: number, locale: Locale): string {
  const formatted = new Intl.NumberFormat(locale === 'is' ? 'is-IS' : 'en-GB', {
    maximumFractionDigits: 2
  }).format(value);
  return locale === 'is' ? formatted.replace('.', ',') : formatted;
}

function seasonalEnglish(startsOn?: string, endsOn?: string): string {
  if (startsOn && endsOn)
    return ` from ${formatLocalizedDateOnly(startsOn, 'en')} through ${formatLocalizedDateOnly(endsOn, 'en')}`;
  if (startsOn) return ` from ${formatLocalizedDateOnly(startsOn, 'en')}`;
  if (endsOn) return ` through ${formatLocalizedDateOnly(endsOn, 'en')}`;
  return '';
}

function seasonalIcelandic(startsOn?: string, endsOn?: string): string {
  if (startsOn && endsOn)
    return ` frá ${formatLocalizedDateOnly(startsOn, 'is')} til og með ${formatLocalizedDateOnly(endsOn, 'is')}`;
  if (startsOn) return ` frá ${formatLocalizedDateOnly(startsOn, 'is')}`;
  if (endsOn) return ` til og með ${formatLocalizedDateOnly(endsOn, 'is')}`;
  return '';
}

function joinList(values: string[]): string {
  return values.join(', ');
}

function joinRestrictions(values: string[], conjunction = 'and'): string {
  if (values.length < 2) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} ${conjunction} ${values.at(-1)}`;
}

const weekdayNames: Record<Locale, Record<number, string>> = {
  en: {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    7: 'Sunday'
  },
  is: {
    1: 'mánudögum',
    2: 'þriðjudögum',
    3: 'miðvikudögum',
    4: 'fimmtudögum',
    5: 'föstudögum',
    6: 'laugardögum',
    7: 'sunnudögum'
  }
};
