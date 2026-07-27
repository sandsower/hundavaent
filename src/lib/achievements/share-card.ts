import type { AchievementGroup, AchievementTier } from '$server/achievements/achievements';

export const ACHIEVEMENT_SHARE_WIDTH = 1200;
export const ACHIEVEMENT_SHARE_HEIGHT = 630;

export interface AchievementShareCard {
  achievementKey: string;
  collection: string | null;
  group: AchievementGroup;
  tier: AchievementTier | null;
  name: string;
  description: string;
  brand: string;
  eyebrow: string;
}

const rosettePath =
  'M43.112 10.87 Q50 5 56.888 10.87 Q63.777 16.74 72.798 17.46 Q81.82 18.18 82.54 27.202 Q83.26 36.223 89.13 43.112 Q95 50 89.13 56.888 Q83.26 63.777 82.54 72.798 Q81.82 81.82 72.798 82.54 Q63.777 83.26 56.888 89.13 Q50 95 43.112 89.13 Q36.223 83.26 27.202 82.54 Q18.18 81.82 17.46 72.798 Q16.74 63.777 10.87 56.888 Q5 50 10.87 43.112 Q16.74 36.223 17.46 27.202 Q18.18 18.18 27.202 17.46 Q36.223 16.74 43.112 10.87 Z';

const tierPalette: Record<AchievementTier | 'bespoke', [string, string, string, string]> = {
  bronze: ['#59331f', '#704126', '#a96843', '#fffaf2'],
  silver: ['#34545e', '#466873', '#7899a3', '#fffaf2'],
  gold: ['#584128', '#755834', '#bf9560', '#fffaf2'],
  platinum: ['#2f5157', '#456d73', '#d6e8e8', '#315c62'],
  bespoke: ['#274b40', '#3f6859', '#67907e', '#fffaf2']
};

export function createAchievementShareSvg(card: AchievementShareCard): string {
  const [edge, shell, face, motifColor] = tierPalette[card.tier ?? 'bespoke'];
  const titleLines = wrapWords(card.name, 25, 2);
  const descriptionLines = wrapWords(card.description, 48, 3);
  const motif = achievementMotif(card);
  const extraRings =
    card.tier === 'platinum'
      ? `<path d="${rosettePath}" transform="translate(7 7) scale(.86)" fill="none" stroke="${motifColor}" stroke-width="1.5" stroke-dasharray="2 3" opacity=".85"/>
         <path d="${rosettePath}" transform="translate(10.5 10.5) scale(.79)" fill="none" stroke="${motifColor}" stroke-width="1.5" opacity=".65"/>`
      : card.tier === 'silver' || card.tier === 'gold'
        ? `<path d="${rosettePath}" transform="translate(10.5 10.5) scale(.79)" fill="none" stroke="${motifColor}" stroke-width="1.5" opacity=".65"/>`
        : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ACHIEVEMENT_SHARE_WIDTH}" height="${ACHIEVEMENT_SHARE_HEIGHT}" viewBox="0 0 ${ACHIEVEMENT_SHARE_WIDTH} ${ACHIEVEMENT_SHARE_HEIGHT}">
  <rect width="1200" height="630" rx="42" fill="#f7f3e8"/>
  <path d="M0 475C195 410 346 506 537 462c215-49 368-4 663 101v67H0Z" fill="#dce9df"/>
  <circle cx="1055" cy="92" r="152" fill="#e4ece7"/>
  <circle cx="1055" cy="92" r="104" fill="none" stroke="#c8d9cf" stroke-width="2"/>
  <g transform="translate(96 128) scale(3.45)">
    <path d="${rosettePath}" fill="${shell}" stroke="${edge}" stroke-width="${card.tier === 'gold' || card.tier === 'platinum' ? 5.5 : 3}"/>
    <path d="${rosettePath}" transform="translate(9 9) scale(.82)" fill="${face}" stroke="#ffffff" stroke-width="1.7" opacity=".98"/>
    ${extraRings}
    <path d="${rosettePath}" transform="translate(15 15) scale(.70)" fill="none" stroke="${motifColor}" stroke-width="1.5" stroke-dasharray="2.5 3.2" opacity=".8"/>
    <g transform="translate(30 30) scale(.84)" color="${motifColor}" fill="none" stroke="${motifColor}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      ${motif}
    </g>
  </g>
  <g font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif">
    <text x="520" y="154" font-size="25" font-weight="750" letter-spacing="3" fill="#45635a">${escapeXml(card.eyebrow.toUpperCase())}</text>
    ${svgTextLines(titleLines, 520, 222, 66, 76, '#243b34', 800)}
    ${svgTextLines(descriptionLines, 520, 398, 30, 42, '#52655f', 500)}
    <g transform="translate(520 542)">
      <circle cx="13" cy="-8" r="6" fill="#3f6859"/>
      <circle cx="29" cy="-8" r="6" fill="#3f6859"/>
      <circle cx="6" cy="7" r="5" fill="#3f6859"/>
      <circle cx="36" cy="7" r="5" fill="#3f6859"/>
      <path d="M10 25c0-10 7-17 14-17s14 7 14 17c0 7-5 10-14 10s-14-3-14-10Z" fill="#3f6859"/>
      <text x="58" y="18" font-size="31" font-weight="800" fill="#2d4b41">${escapeXml(card.brand)}</text>
    </g>
  </g>
</svg>`;
}

export async function renderAchievementSharePng(card: AchievementShareCard): Promise<File> {
  const svg = createAchievementShareSvg(card);
  const image = await loadSvgImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = ACHIEVEMENT_SHARE_WIDTH;
  canvas.height = ACHIEVEMENT_SHARE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(image, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('PNG export failed'))),
      'image/png'
    );
  });

  return new File([blob], achievementShareFilename(card), { type: 'image/png' });
}

export function achievementShareFilename(card: AchievementShareCard): string {
  const slug = card.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return `hundavaent-${slug || 'achievement'}.png`;
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Share image could not be rendered'));
    };
    image.src = url;
  });
}

function achievementMotif(card: AchievementShareCard): string {
  if (card.collection === 'explorer_places') {
    return '<path d="M2 36c5-1 5-7 10-8s5 4 10 2 4-9 12-11" stroke-dasharray="3 4"/><circle cx="2" cy="36" r="2.5" fill="currentColor" stroke="none"/><path d="M28 11h7v7m0-7-9 9"/>';
  }
  if (card.collection === 'place_categories') {
    return '<rect x="2" y="8" width="12" height="12" rx="3"/><rect x="22" y="8" width="12" height="12" rx="6"/><path d="M2 40 8 27l6 13H2Zm26-13 7 7-7 7-7-7 7-7Z"/>';
  }
  if (card.collection === 'municipalities') {
    return '<path d="m1 12 10-4 14 4 10-4v28l-10 4-14-4-10 4V12Zm10-4v28m14-24v28"/><circle cx="18" cy="23" r="3" fill="currentColor" stroke="none"/>';
  }
  if (card.collection === 'contributions') {
    return '<path d="M7 7h16l7 7v27H7V7Zm16 0v8h7M12 25l4 4 8-9"/>';
  }
  if (card.achievementKey === 'first_favourite') {
    return '<path d="M18 39S2.5 30.1 2.5 18.2c0-5 3.6-8.7 8.4-8.7 3 0 5.7 1.7 7.1 4.2 1.4-2.5 4.1-4.2 7.1-4.2 4.8 0 8.4 3.7 8.4 8.7C33.5 30.1 18 39 18 39Z"/>';
  }
  if (card.group === 'longevity') {
    return '<circle cx="18" cy="24" r="17"/><path d="M18 13v12l8 5"/>';
  }
  return '<circle cx="11" cy="16" r="4"/><circle cx="25" cy="16" r="4"/><circle cx="5" cy="26" r="3.5"/><circle cx="31" cy="26" r="3.5"/><path d="M9 35c0-6 4-10 9-10s9 4 9 10c0 4-3 6-9 6s-9-2-9-6Z"/>';
}

function svgTextLines(
  lines: string[],
  x: number,
  y: number,
  size: number,
  lineHeight: number,
  fill: string,
  weight: number
): string {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
    )
    .join('');
}

function wrapWords(value: string, maximum: number, maximumLines: number): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > maximum) {
      if (lines.length === maximumLines) {
        lines[maximumLines - 1] = `${lines[maximumLines - 1].replace(/[.…]+$/, '')}…`;
        break;
      }
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  return lines;
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ??
      character
  );
}
