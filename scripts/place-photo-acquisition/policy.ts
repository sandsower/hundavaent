import { createHash } from 'node:crypto';

import type { AcquisitionRightsBasis } from './types.ts';

const blockedHostSuffixes = [
  'facebook.com',
  'fbcdn.net',
  'instagram.com',
  'cdninstagram.com',
  'googleusercontent.com',
  'ggpht.com',
  'maps.google.com',
  'google.com'
];

export function isBlockedPhotoHost(rawUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return true;
  }
  return blockedHostSuffixes.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`)
  );
}

export function mapCommonsLicense(value: string): AcquisitionRightsBasis | null {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (/^cc0(?:\s|$)/.test(normalized)) return 'cc0';
  if (/^public domain(?:\s|$)/.test(normalized) || normalized === 'pd') return 'public_domain';
  if (/^cc by sa(?:\s|$)/.test(normalized)) return 'cc_by_sa';
  if (/^cc by(?:\s|$)/.test(normalized) && !/\b(?:nc|nd)\b/.test(normalized)) return 'cc_by';
  return null;
}

export function scoreCandidateForPlace(
  place: Pick<import('./types.ts').AcquisitionPlace, 'nameIs' | 'nameEn'>,
  candidate: Pick<import('./types.ts').AcquisitionCandidate, 'title'>
): number {
  const title = normalize(candidate.title.replace(/^file:/i, '').replace(/\.[a-z0-9]+$/i, ''));
  const names = [...new Set([normalize(place.nameIs), normalize(place.nameEn)])].filter(Boolean);
  let best = 0;
  for (const name of names) {
    if (new RegExp(`\\b(?:from|fra)\\b.*\\b${escapeRegExp(name)}\\b`).test(title)) {
      continue;
    }
    if (title.includes(name)) best = Math.max(best, 100 + Math.min(name.length, 40));
    const tokens = distinctiveTokens(name);
    if (tokens.length > 1 && tokens.every((token) => title.includes(token))) {
      best = Math.max(best, 40 + tokens.length * 15);
    }
  }
  return best;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stableCandidateRequestId(placeId: string, sourceId: string): string {
  const hex = createHash('sha256').update(`${placeId}\0${sourceId}`).digest('hex').slice(0, 32);
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}`;
  const variant = `${((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16)}${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${variant.slice(0, 4)}-${variant.slice(4)}`;
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function distinctiveTokens(value: string): string[] {
  const generic = new Set(['the', 'and', 'cafe', 'kaffi', 'bar', 'restaurant', 'reykjavik', 'is']);
  return value.split(' ').filter((token) => token.length >= 3 && !generic.has(token));
}
