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

// The brand paw, the same path the header logo draws, on a 256 viewBox.
const brandPawPath =
  'M240,108a28,28,0,1,1-28-28A28,28,0,0,1,240,108ZM72,108a28,28,0,1,0-28,28A28,28,0,0,0,72,108ZM92,88A28,28,0,1,0,64,60,28,28,0,0,0,92,88Zm72,0a28,28,0,1,0-28-28A28,28,0,0,0,164,88Zm23.12,60.86a35.3,35.3,0,0,1-16.87-21.14,44,44,0,0,0-84.5,0A35.25,35.25,0,0,1,69,148.82,40,40,0,0,0,88,224a39.48,39.48,0,0,0,15.52-3.13,64.09,64.09,0,0,1,48.87,0,40,40,0,0,0,34.73-72Z';

// edge, shell, face, faceEdge, motif - the same five values the tier badge CSS uses on the
// achievements page, so a shared image is the page's badge rather than a second house style.
const tierPalette: Record<AchievementTier | 'bespoke', [string, string, string, string, string]> = {
  bronze: ['#59331f', '#704126', '#a96843', '#ce9a77', '#fbfeff'],
  silver: ['#34545e', '#466873', '#7899a3', '#b7ced4', '#fbfeff'],
  gold: ['#584128', '#755834', '#bf9560', '#e0c49d', '#fbfeff'],
  platinum: ['#2f5157', '#456d73', '#d6e8e8', '#f5ffff', '#315c62'],
  bespoke: ['#14444f', '#1c5b69', '#287e91', '#6aa9b4', '#fbfeff']
};

const uiFont = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
const displayFont = "'Source Serif 4', Georgia, 'Times New Roman', serif";

export function createAchievementShareSvg(card: AchievementShareCard): string {
  const [edge, shell, face, faceEdge, motifColor] = tierPalette[card.tier ?? 'bespoke'];
  const raised = card.tier === 'gold' || card.tier === 'platinum';
  const motif = achievementMotif(card);

  const ring = (transform: string, width: number, dash: string, opacity: string): string =>
    `<path d="${rosettePath}" transform="${transform}" fill="none" stroke="${motifColor}" stroke-width="${width}"${
      dash ? ` stroke-dasharray="${dash}"` : ''
    } opacity="${opacity}"/>`;
  const extraRings =
    card.tier === 'platinum'
      ? ring('translate(7 7) scale(.86)', 0.9, '1.5 2.2', '.85') +
        ring('translate(10.5 10.5) scale(.79)', 1, '', '.7')
      : card.tier === 'silver' || card.tier === 'gold'
        ? ring('translate(10.5 10.5) scale(.79)', 1, '', '.7')
        : '';

  // A tier rung reads as its collection with the rung named beneath it, the way the grid cell
  // does - not as one long "Collection - Tier" line stretched across the card.
  const [collectionLabel, tierLabel] = card.name.split(' - ');
  const titleLines = wrapWords(tierLabel ? collectionLabel : card.name, 17, 2);
  let cursor = 268;
  let copyBlock = svgTextLines(titleLines, 560, cursor, 74, 84, '#163845', 650, displayFont);
  cursor += (titleLines.length - 1) * 84;
  if (tierLabel) {
    cursor += 54;
    copyBlock += `<text x="560" y="${cursor}" font-family="${uiFont}" font-size="27" font-weight="900" letter-spacing="4.6" fill="${shell}">${escapeXml(
      tierLabel.toUpperCase()
    )}</text>`;
  }
  cursor += 62;
  copyBlock += svgTextLines(
    wrapWords(card.description, 38, 3),
    560,
    cursor,
    28,
    40,
    '#546e79',
    500,
    uiFont
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ACHIEVEMENT_SHARE_WIDTH}" height="${ACHIEVEMENT_SHARE_HEIGHT}" viewBox="0 0 ${ACHIEVEMENT_SHARE_WIDTH} ${ACHIEVEMENT_SHARE_HEIGHT}">
  <defs>
    <linearGradient id="share-ground" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fdeeec"/>
      <stop offset="0.62" stop-color="#fbfeff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#share-ground)"/>
  <circle cx="300" cy="315" r="150" fill="#fff6d0" opacity=".55"/>
  <circle cx="300" cy="315" r="150" fill="none" stroke="#f6cdc9"/>
  <circle cx="300" cy="315" r="196" fill="none" stroke="#136d9c" stroke-opacity=".42" stroke-width="3" stroke-dasharray="10 12"/>
  <g transform="translate(200 215) scale(2)">
    <path d="${rosettePath}" fill="${shell}" stroke="${edge}" stroke-width="${raised ? 5.5 : 3}"/>
    <path d="${rosettePath}" transform="translate(9 9) scale(.82)" fill="${face}" stroke="${faceEdge}" stroke-width="2"/>
    ${extraRings}
    ${ring('translate(15 15) scale(.70)', 1.35, '2.5 3.2', '.78')}
    <g transform="translate(35 35) scale(.6)" color="${motifColor}" fill="none" stroke="${motifColor}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">
      ${motif}
    </g>
  </g>
  <g transform="translate(439 454)">
    <circle r="26" fill="#ffd642"/>
    <g transform="translate(-13 -13) scale(0.1)" fill="#163845"><path d="${brandPawPath}"/></g>
  </g>
  <g>
    <text x="560" y="204" font-family="${uiFont}" font-size="25" font-weight="900" letter-spacing="3.4" fill="#b3392e">${escapeXml(
      card.eyebrow.toUpperCase()
    )}</text>
    ${copyBlock}
    <g transform="translate(560 520)">
      <g transform="scale(0.14)" fill="#ef5f56"><path d="${brandPawPath}"/></g>
      <text x="48" y="28" font-family="${displayFont}" font-size="34" font-weight="650" fill="#163845">${escapeXml(
        card.brand
      )}</text>
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

// Motifs are drawn on a 48-unit box centred in the rosette face.
function achievementMotif(card: AchievementShareCard): string {
  if (card.collection === 'explorer_places') {
    return '<path d="M8 36c5-1 5-7 10-8s5 4 10 2 4-9 12-11" stroke-dasharray="3 4"/><circle cx="8" cy="36" r="2.5" fill="currentColor" stroke="none"/><path d="M34 11h7v7"/><path d="m41 11-9 9"/>';
  }
  if (card.collection === 'place_categories') {
    return '<rect x="8" y="8" width="12" height="12" rx="3"/><rect x="28" y="8" width="12" height="12" rx="6"/><path d="M8 40 14 27l6 13H8Z"/><path d="m34 27 7 7-7 7-7-7 7-7Z"/>';
  }
  if (card.collection === 'municipalities') {
    return '<path d="m7 12 10-4 14 4 10-4v28l-10 4-14-4-10 4V12Z"/><path d="M17 8v28M31 12v28"/><circle cx="24" cy="23" r="3" fill="currentColor" stroke="none"/>';
  }
  if (card.collection === 'contributions') {
    return '<path d="M13 7h16l7 7v27H13V7Z"/><path d="M29 7v8h7M18 25l4 4 8-9"/>';
  }
  if (card.achievementKey === 'first_favourite') {
    return '<path d="M24 39S8.5 30.1 8.5 18.2c0-5 3.6-8.7 8.4-8.7 3 0 5.7 1.7 7.1 4.2 1.4-2.5 4.1-4.2 7.1-4.2 4.8 0 8.4 3.7 8.4 8.7C39.5 30.1 24 39 24 39Z"/><circle cx="20" cy="22" r="1.7" fill="currentColor" stroke="none"/><circle cx="28" cy="22" r="1.7" fill="currentColor" stroke="none"/><path d="M19.5 28.5c2.7 2.4 6.3 2.4 9 0"/>';
  }
  if (card.group === 'longevity') {
    return '<circle cx="24" cy="24" r="17"/><path d="M24 13v12l8 5"/>';
  }
  if (card.achievementKey === 'first_check_in') {
    return '<path d="M36 20.5C36 29.5 24 40 24 40S12 29.5 12 20.5a12 12 0 1 1 24 0Z"/><circle cx="24" cy="20" r="4.2"/>';
  }
  return '<circle cx="17" cy="16" r="4"/><circle cx="31" cy="16" r="4"/><circle cx="11" cy="26" r="3.5"/><circle cx="37" cy="26" r="3.5"/><path d="M15 35c0-6 4-10 9-10s9 4 9 10c0 4-3 6-9 6s-9-2-9-6Z"/>';
}

function svgTextLines(
  lines: string[],
  x: number,
  y: number,
  size: number,
  lineHeight: number,
  fill: string,
  weight: number,
  family: string
): string {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
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
