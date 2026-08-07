import { expect, test } from 'vitest';

import '../../src/app.css';
import { emptyMapLibreStyle } from '../../src/lib/map/maplibre-adapter';

test('the visual foundation is deterministic across browser hosts', async () => {
  const loadedInterFaces = await document.fonts.load(
    '400 16px "Inter Variable"',
    'Hundavænt staður'
  );
  const loadedSourceSerifFaces = await document.fonts.load(
    '600 24px "Source Serif 4 Variable"',
    'Hundavænt staður'
  );
  await document.fonts.ready;

  const interFaces = [...document.fonts].filter(
    (face) => face.family.replaceAll(/["']/g, '') === 'Inter Variable'
  );
  const sourceSerifFaces = [...document.fonts].filter(
    (face) => face.family.replaceAll(/["']/g, '') === 'Source Serif 4 Variable'
  );

  expect(interFaces.length).toBeGreaterThan(0);
  expect(loadedInterFaces.length).toBeGreaterThan(0);
  expect(loadedInterFaces.every((face) => face.status === 'loaded')).toBe(true);
  expect(sourceSerifFaces.length).toBeGreaterThan(0);
  expect(loadedSourceSerifFaces.length).toBeGreaterThan(0);
  expect(loadedSourceSerifFaces.every((face) => face.status === 'loaded')).toBe(true);
  expect(emptyMapLibreStyle.layers).toEqual([
    {
      id: 'hundavaent-background',
      type: 'background',
      paint: { 'background-color': '#dce5df' }
    }
  ]);
});

test('Tailwind preflight and the semantic baseline own browser normalization', async () => {
  const fixture = document.createElement('section');
  fixture.innerHTML =
    '<h1>Heading</h1><p>Paragraph</p><small>Small</small><ul><li>Item</li></ul><fieldset><legend>Legend</legend></fieldset><a href="#preflight-proof">Link</a><button>Action</button><input type="file"><input type="checkbox"><input type="radio"><input type="text" placeholder="Placeholder"><input type="search"><input type="date"><select><option>Option</option></select><img alt="" width="10" height="5"><svg></svg>';
  document.body.append(fixture);

  const browserDefaults = document.createElement('iframe');
  browserDefaults.srcdoc =
    '<h1>Heading</h1><p>Paragraph</p><small>Small</small><ul><li>Item</li></ul><fieldset><legend>Legend</legend></fieldset><a href="#preflight-proof">Link</a><button>Action</button><input type="file"><input type="checkbox"><input type="radio"><input type="text" placeholder="Placeholder"><input type="search"><input type="date"><select><option>Option</option></select><img alt="" width="10" height="5"><svg></svg>';
  await new Promise<void>((resolve) => {
    browserDefaults.addEventListener('load', () => resolve(), { once: true });
    document.body.append(browserDefaults);
  });

  const heading = fixture.querySelector('h1')!;
  const paragraph = fixture.querySelector('p')!;
  const small = fixture.querySelector('small')!;
  const list = fixture.querySelector('ul')!;
  const fieldset = fixture.querySelector('fieldset')!;
  const legend = fixture.querySelector('legend')!;
  const link = fixture.querySelector('a')!;
  const button = fixture.querySelector('button')!;
  const fileInput = fixture.querySelector('input[type="file"]')!;
  const checkbox = fixture.querySelector('input[type="checkbox"]')!;
  const radio = fixture.querySelector('input[type="radio"]')!;
  const textInput = fixture.querySelector('input[type="text"]')!;
  const searchInput = fixture.querySelector('input[type="search"]')!;
  const dateInput = fixture.querySelector('input[type="date"]')!;
  const select = fixture.querySelector('select')!;
  const image = fixture.querySelector('img')!;
  const svg = fixture.querySelector('svg')!;
  const fixtureStyles = getComputedStyle(fixture);
  const headingStyles = getComputedStyle(heading);
  const defaultHeadingStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('h1')!
  );
  const defaultParagraphStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('p')!
  );
  const defaultSmallStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('small')!
  );
  const defaultListStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('ul')!
  );
  const defaultFieldsetStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('fieldset')!
  );
  const defaultLegendStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('legend')!
  );
  const defaultLinkStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('a')!
  );
  const defaultButtonStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('button')!
  );
  const defaultFileButtonStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('input[type="file"]')!,
    '::file-selector-button'
  );
  const defaultCheckboxStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('input[type="checkbox"]')!
  );
  const defaultRadioStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('input[type="radio"]')!
  );
  const defaultTextInput = browserDefaults.contentDocument!.querySelector('input[type="text"]')!;
  const defaultTextInputStyles = browserDefaults.contentWindow!.getComputedStyle(defaultTextInput);
  const defaultPlaceholderStyles = browserDefaults.contentWindow!.getComputedStyle(
    defaultTextInput,
    '::placeholder'
  );
  const defaultSearchDecorationStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('input[type="search"]')!,
    '::-webkit-search-decoration'
  );
  const defaultDateValueStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('input[type="date"]')!,
    '::-webkit-date-and-time-value'
  );
  const defaultDateEditStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('input[type="date"]')!,
    '::-webkit-datetime-edit'
  );
  const defaultDateFieldsStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('input[type="date"]')!,
    '::-webkit-datetime-edit-fields-wrapper'
  );
  const defaultCalendarIndicatorStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('input[type="date"]')!,
    '::-webkit-calendar-picker-indicator'
  );
  const defaultSelectStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('select')!
  );
  const defaultImageStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('img')!
  );
  const defaultSvgStyles = browserDefaults.contentWindow!.getComputedStyle(
    browserDefaults.contentDocument!.querySelector('svg')!
  );

  expect({
    marginBlockStart: headingStyles.marginBlockStart,
    marginBlockEnd: headingStyles.marginBlockEnd,
    fontSize: headingStyles.fontSize,
    fontWeight: headingStyles.fontWeight
  }).toEqual({
    marginBlockStart: defaultHeadingStyles.marginBlockStart,
    marginBlockEnd: defaultHeadingStyles.marginBlockEnd,
    fontSize: defaultHeadingStyles.fontSize,
    fontWeight: defaultHeadingStyles.fontWeight
  });
  expect(getComputedStyle(paragraph).marginBlockStart).toBe(
    defaultParagraphStyles.marginBlockStart
  );
  expect(getComputedStyle(small).fontSize).toBe(defaultSmallStyles.fontSize);
  expect(getComputedStyle(list).listStyleType).toBe(defaultListStyles.listStyleType);
  expect(getComputedStyle(list).paddingInlineStart).toBe(defaultListStyles.paddingInlineStart);
  expect(getComputedStyle(fieldset).marginInline).toBe(defaultFieldsetStyles.marginInline);
  expect(getComputedStyle(fieldset).padding).toBe(defaultFieldsetStyles.padding);
  expect(getComputedStyle(fieldset).border).toBe(defaultFieldsetStyles.border);
  expect(getComputedStyle(legend).paddingInline).toBe(defaultLegendStyles.paddingInline);
  expect(getComputedStyle(link).color).toBe(defaultLinkStyles.color);
  expect(getComputedStyle(link).textDecorationLine).toBe(defaultLinkStyles.textDecorationLine);
  expect(fixtureStyles.lineHeight).toBe('normal');
  expect(getComputedStyle(button).fontFamily).toBe(fixtureStyles.fontFamily);
  expect(getComputedStyle(button).margin).toBe(defaultButtonStyles.margin);
  expect(getComputedStyle(button).padding).toBe(defaultButtonStyles.padding);
  expect(getComputedStyle(button).border).toBe(defaultButtonStyles.border);
  expect(getComputedStyle(button).backgroundColor).toBe(defaultButtonStyles.backgroundColor);
  expect(getComputedStyle(button).color).toBe(defaultButtonStyles.color);
  expect(getComputedStyle(button).appearance).toBe(defaultButtonStyles.appearance);
  const fileButtonStyles = getComputedStyle(fileInput, '::file-selector-button');
  expect(fileButtonStyles.padding).toBe(defaultFileButtonStyles.padding);
  expect(fileButtonStyles.border).toBe(defaultFileButtonStyles.border);
  expect(fileButtonStyles.backgroundColor).toBe(defaultFileButtonStyles.backgroundColor);
  expect(fileButtonStyles.appearance).toBe(defaultFileButtonStyles.appearance);
  expect(fileButtonStyles.fontFamily).toBe(defaultFileButtonStyles.fontFamily);
  expect(fileButtonStyles.fontSize).toBe(fixtureStyles.fontSize);
  expect(fileButtonStyles.fontWeight).toBe(fixtureStyles.fontWeight);
  expect(fileButtonStyles.lineHeight).toBe(defaultFileButtonStyles.lineHeight);
  expect(getComputedStyle(checkbox).margin).toBe(defaultCheckboxStyles.margin);
  expect(getComputedStyle(checkbox).border).toBe(defaultCheckboxStyles.border);
  expect(getComputedStyle(checkbox).backgroundColor).toBe(defaultCheckboxStyles.backgroundColor);
  expect(getComputedStyle(checkbox).borderRadius).toBe(defaultCheckboxStyles.borderRadius);
  expect(getComputedStyle(radio).margin).toBe(defaultRadioStyles.margin);
  expect(getComputedStyle(radio).border).toBe(defaultRadioStyles.border);
  expect(getComputedStyle(radio).backgroundColor).toBe(defaultRadioStyles.backgroundColor);
  expect(getComputedStyle(radio).borderRadius).toBe(defaultRadioStyles.borderRadius);
  expect(getComputedStyle(textInput).margin).toBe(defaultTextInputStyles.margin);
  expect(getComputedStyle(textInput).border).toBe(defaultTextInputStyles.border);
  expect(getComputedStyle(textInput).backgroundColor).toBe(defaultTextInputStyles.backgroundColor);
  expect(getComputedStyle(textInput).borderRadius).toBe(defaultTextInputStyles.borderRadius);
  expect(getComputedStyle(textInput, '::placeholder').color).toBe(defaultPlaceholderStyles.color);
  expect(getComputedStyle(textInput, '::placeholder').opacity).toBe(
    defaultPlaceholderStyles.opacity
  );
  expect(getComputedStyle(searchInput, '::-webkit-search-decoration').appearance).toBe(
    defaultSearchDecorationStyles.appearance
  );
  expect(getComputedStyle(dateInput, '::-webkit-date-and-time-value').minHeight).toBe(
    defaultDateValueStyles.minHeight
  );
  expect(getComputedStyle(dateInput, '::-webkit-date-and-time-value').textAlign).toBe(
    defaultDateValueStyles.textAlign
  );
  expect(getComputedStyle(dateInput, '::-webkit-datetime-edit').display).toBe(
    defaultDateEditStyles.display
  );
  expect(getComputedStyle(dateInput, '::-webkit-datetime-edit-fields-wrapper').paddingBlock).toBe(
    defaultDateFieldsStyles.paddingBlock
  );
  expect(getComputedStyle(dateInput, '::-webkit-calendar-picker-indicator').lineHeight).toBe(
    defaultCalendarIndicatorStyles.lineHeight
  );
  expect(getComputedStyle(select).margin).toBe(defaultSelectStyles.margin);
  expect(getComputedStyle(select).border).toBe(defaultSelectStyles.border);
  expect(getComputedStyle(select).backgroundColor).toBe(defaultSelectStyles.backgroundColor);
  expect(getComputedStyle(select).borderRadius).toBe(defaultSelectStyles.borderRadius);
  expect(getComputedStyle(image).display).toBe(defaultImageStyles.display);
  expect(getComputedStyle(image).verticalAlign).toBe(defaultImageStyles.verticalAlign);
  expect(getComputedStyle(image).maxWidth).toBe(defaultImageStyles.maxWidth);
  expect(getComputedStyle(image).height).toBe(defaultImageStyles.height);
  expect(getComputedStyle(svg).display).toBe(defaultSvgStyles.display);
  expect(getComputedStyle(svg).verticalAlign).toBe(defaultSvgStyles.verticalAlign);

  fixture.remove();
  browserDefaults.remove();
});

test('place and operations modes share semantic colours while changing density', () => {
  const placeMode = document.createElement('section');
  placeMode.dataset.uiMode = 'place';
  const operationsMode = document.createElement('section');
  operationsMode.dataset.uiMode = 'operations';
  document.body.append(placeMode, operationsMode);

  const placeStyles = getComputedStyle(placeMode);
  const operationsStyles = getComputedStyle(operationsMode);

  expect(placeStyles.getPropertyValue('--hv-color-snow').trim()).toBe('#edf8fb');
  expect(placeStyles.getPropertyValue('--hv-color-basalt').trim()).toBe('#163845');
  expect(placeStyles.getPropertyValue('--hv-color-moss').trim()).toBe('#287e91');
  expect(placeStyles.getPropertyValue('--hv-color-fjord').trim()).toBe('#136d9c');
  expect(placeStyles.getPropertyValue('--hv-color-signal').trim()).toBe('#ffd642');
  expect(placeStyles.getPropertyValue('--hv-color-brand-paw').trim()).toBe('#ef5f56');
  expect(placeStyles.getPropertyValue('--hv-access-area').trim()).toBe('#dce7e1');
  expect(placeStyles.getPropertyValue('--hv-access-restraint').trim()).toBe('#f7dd9a');
  expect(placeStyles.getPropertyValue('--hv-access-permission').trim()).toBe('#cfe5ed');
  expect(placeStyles.getPropertyValue('--hv-access-eligibility').trim()).toBe('#f3d4be');
  expect(placeStyles.getPropertyValue('--hv-access-timing').trim()).toBe('#d9d5e9');
  expect(placeStyles.getPropertyValue('--hv-access-special').trim()).toBe('#f1d7bd');
  expect(placeStyles.getPropertyValue('--hv-access-unknown').trim()).toBe('#e4e7e5');
  expect(operationsStyles.getPropertyValue('--hv-color-signal').trim()).toBe(
    placeStyles.getPropertyValue('--hv-color-signal').trim()
  );
  expect(operationsStyles.getPropertyValue('--hv-space-context').trim()).not.toBe(
    placeStyles.getPropertyValue('--hv-space-context').trim()
  );

  placeMode.remove();
  operationsMode.remove();
});

test('selected map markers stay compact and reveal labels only on direct interaction', () => {
  const marker = document.createElement('button');
  marker.className = 'hundavaent-marker selected';
  marker.setAttribute('aria-pressed', 'true');
  marker.innerHTML =
    '<svg class="pin"><path class="pin-body"></path></svg><span class="marker-label">Brikk</span>';
  document.body.append(marker);

  const pin = marker.querySelector<SVGElement>('.pin')!;
  const label = marker.querySelector<HTMLElement>('.marker-label')!;
  expect(getComputedStyle(pin).width).toBe('36px');
  // Hidden by visibility rather than display, so the reveal can settle on a transform.
  expect(getComputedStyle(label).visibility).toBe('hidden');
  expect(getComputedStyle(marker.querySelector('.pin-body')!).fill).toBe('rgb(255, 214, 66)');

  marker.remove();
});
