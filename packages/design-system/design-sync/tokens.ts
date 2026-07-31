// Parses the app's --hv-* custom properties out of tokens.css at build time so the Foundations
// cards never hand-copy a value that could drift from the source of truth. The operations-mode
// and reduced-motion blocks later in that file DO redeclare spacing, radius, control-height,
// motion, and fade tokens, so the parse below is deliberately first-occurrence-wins: the base
// `:root, [data-ui-mode]` block opens the file, and its member-mode values are what the
// Foundations cards document (the operations retune gets its own card instead). If tokens.css
// ever stops declaring the base block first, this parse must learn to scope to that block.

import { readFileSync } from 'node:fs';

// Same relative depth as design-sync/preview-entry.css's @import of the same file: three levels
// up from design-sync/ reaches the repo root, then into the app's own token source.
const tokensUrl = new URL('../../../src/lib/design-system/tokens.css', import.meta.url);
const tokensCss = readFileSync(tokensUrl, 'utf8');

export interface TokenRow {
  name: string;
  value: string;
}

function parseDeclarations(css: string): Map<string, string> {
  const declarations = new Map<string, string>();
  const pattern = /(--hv-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  for (const match of css.matchAll(pattern)) {
    const [, name, rawValue] = match;
    if (!declarations.has(name)) declarations.set(name, rawValue.trim());
  }
  return declarations;
}

// Resolves a single level of var(--hv-*) indirection (e.g. --hv-access-symbol-border's
// var(--hv-color-basalt)) against the full declaration map. Values that are not themselves a bare
// var() reference - literal hex/rgb, or anything with additional text around the var() - are
// returned unchanged; the design system has no token chain deeper than one hop today.
function resolveValue(value: string, declarations: Map<string, string>): string {
  const reference = value.match(/^var\((--hv-[a-z0-9-]+)\)$/);
  if (!reference) return value;
  return declarations.get(reference[1]) ?? value;
}

export function readColorSwatches(): { colors: TokenRow[]; access: TokenRow[] } {
  const declarations = parseDeclarations(tokensCss);
  const colors: TokenRow[] = [];
  const access: TokenRow[] = [];

  for (const [name, rawValue] of declarations) {
    if (name.startsWith('--hv-color-')) {
      colors.push({
        name: name.slice('--hv-color-'.length),
        value: resolveValue(rawValue, declarations)
      });
    } else if (name.startsWith('--hv-access-')) {
      access.push({
        name: name.slice('--hv-access-'.length),
        value: resolveValue(rawValue, declarations)
      });
    }
  }

  return { colors, access };
}

function lookup(declarations: Map<string, string>, shortName: string): TokenRow {
  const name = `--hv-${shortName}`;
  return { name, value: declarations.get(name) ?? '' };
}

export function readSpacingAndRadii(): {
  space: TokenRow[];
  radii: TokenRow[];
  controlHeight: TokenRow;
} {
  const declarations = parseDeclarations(tokensCss);
  const spaceNames = [
    'space-context',
    'space-panel',
    'space-edge',
    'space-section',
    'space-actions'
  ];
  const radiusNames = ['radius-control', 'radius-panel', 'radius-shell'];

  return {
    space: spaceNames.map((name) => lookup(declarations, name)),
    radii: radiusNames.map((name) => lookup(declarations, name)),
    controlHeight: lookup(declarations, 'control-height')
  };
}

export function readMotionTokens(): TokenRow[] {
  const declarations = parseDeclarations(tokensCss);
  const names = [
    'motion-stagger',
    'motion-instant',
    'motion-quick',
    'motion-considered',
    'motion-traverse',
    'motion-celebrate',
    'motion-ambient',
    'fade-quick',
    'fade-considered',
    'ease-settle',
    'ease-exit',
    'ease-overshoot'
  ];
  return names.map((name) => lookup(declarations, name));
}
