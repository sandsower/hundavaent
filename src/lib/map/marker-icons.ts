/**
 * Inline SVG markup for map marker pins.
 *
 * Icon artwork is vendored rather than pulled in as a dependency because the map
 * adapter builds marker DOM outside Svelte and only ever needs these few glyphs.
 * Sources and licenses:
 * - Brand paw: Phosphor Icons (fill weight), MIT - https://github.com/phosphor-icons/core
 * - Category glyphs: Lucide, ISC - https://github.com/lucide-icons/lucide
 */

const PIN_BODY_PATH =
  'M24 2 C35.5 2 44.5 11 44.5 22.4 C44.5 34 24 58 24 58 C24 58 3.5 34 3.5 22.4 C3.5 11 12.5 2 24 2 Z';

const PHOSPHOR_PAW_PRINT_FILL =
  'M240,108a28,28,0,1,1-28-28A28,28,0,0,1,240,108ZM72,108a28,28,0,1,0-28,28A28,28,0,0,0,72,108ZM92,88A28,28,0,1,0,64,60,28,28,0,0,0,92,88Zm72,0a28,28,0,1,0-28-28A28,28,0,0,0,164,88Zm23.12,60.86a35.3,35.3,0,0,1-16.87-21.14,44,44,0,0,0-84.5,0A35.25,35.25,0,0,1,69,148.82,40,40,0,0,0,88,224a39.48,39.48,0,0,0,15.52-3.13,64.09,64.09,0,0,1,48.87,0,40,40,0,0,0,34.73-72Z';

const LUCIDE_CATEGORY_PATHS: Record<string, string> = {
  food_drink:
    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  shopping:
    '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
  outdoors:
    '<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>',
  accommodation:
    '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>',
  public_cultural:
    '<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>'
};

/**
 * Full pin markup for a single-place marker: teardrop body plus the place's
 * category glyph, or the brand paw when the category is unknown. Colors come
 * from the stylesheet (`.pin-body`, `.pin-icon-*`), so selection states are
 * pure CSS.
 */
export function markerPinSvg(category?: string): string {
  const categoryPaths = category ? LUCIDE_CATEGORY_PATHS[category] : undefined;
  const glyph = categoryPaths
    ? `<g class="pin-icon-stroke" transform="translate(11.5,8.5) scale(1.05)">${categoryPaths}</g>`
    : `<g class="pin-icon-fill" transform="translate(11.5,9) scale(0.098)"><path d="${PHOSPHOR_PAW_PRINT_FILL}"/></g>`;
  return `<svg class="pin" viewBox="0 0 48 60" aria-hidden="true" focusable="false"><path class="pin-body" d="${PIN_BODY_PATH}"/>${glyph}</svg>`;
}
