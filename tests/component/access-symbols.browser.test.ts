import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { page as browserPage } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import AccessSymbols from '$lib/discovery/AccessSymbols.svelte';

const simpleCondition = {
  accessArea: 'indoors' as const,
  restraintCondition: 'leash_required' as const,
  permissionRequirement: 'standing_permission' as const,
  dogEligibility: { scope: 'all_dogs' as const },
  availabilityState: 'not_stated' as const,
  availabilityWindow: {}
};

function expectContained(child: Element, parent: Element): void {
  const childRect = child.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  expect(childRect.left).toBeGreaterThanOrEqual(parentRect.left - 0.5);
  expect(childRect.right).toBeLessThanOrEqual(parentRect.right + 0.5);
}

function expectVerticallyContained(child: Element, parent: Element): void {
  const childRect = child.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  expect(childRect.height).toBeGreaterThan(0);
  expect(childRect.top).toBeGreaterThanOrEqual(parentRect.top - 0.5);
  expect(childRect.bottom).toBeLessThanOrEqual(parentRect.bottom + 0.5);
}

function activeTooltip(): HTMLElement {
  const tooltip = document.body.querySelector<HTMLElement>('[data-access-tooltip]');
  if (!tooltip) throw new Error('Expected the shared access tooltip');
  return tooltip;
}

describe('AccessSymbols', () => {
  it('renders five labelled controls and keeps activated details visible', async () => {
    render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition],
      copy: catalogues.en
    });

    expect(screen.getByLabelText('Dog access at Brikk')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(5);
    const timing = screen.getByRole('button', { name: 'Information not stated' });
    await fireEvent.click(timing);
    expect(timing.getAttribute('aria-expanded')).toBe('true');
    const persistentDetail = document.querySelector<HTMLElement>('[data-access-detail]')!;
    expect(persistentDetail.textContent).toContain('does not imply permission');
    const detailStyle = getComputedStyle(persistentDetail);
    expect(detailStyle.backgroundColor).toBe('rgb(251, 252, 249)');
    expect(detailStyle.borderLeftColor).toBe('rgb(242, 201, 76)');
    expect(Number.parseFloat(detailStyle.borderLeftWidth)).toBeGreaterThanOrEqual(4);
  });

  it('still announces the explanation through the dedicated live region when a chip opens', async () => {
    // The detail panel gave up role="status" so it could hold interactive controls. That is only
    // safe if the announcement it used to make now comes from the visually hidden region.
    render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition],
      copy: catalogues.en
    });
    const region = document.querySelector<HTMLElement>('[data-access-announcement]')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent?.trim()).toBe('');
    expect(document.querySelector('[data-access-detail]')).toBeNull();

    const restraint = screen.getByRole('button', { name: 'Leash required' });
    await fireEvent.click(restraint);

    await waitFor(() => expect(region.textContent).toContain('Leash required'));
    expect(region.textContent).toContain('must remain on a leash');
    // The panel that used to be the live region must not be one any more.
    expect(document.querySelector('[data-access-detail]')?.getAttribute('role')).toBeNull();

    await fireEvent.click(restraint);
    await waitFor(() => expect(region.textContent?.trim()).toBe(''));
  });

  it('keeps every access symbol in place when an explanation opens', async () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition],
      copy: catalogues.en
    });
    const symbols = [...container.querySelectorAll<HTMLButtonElement>('.symbols > .symbol')];
    const initialPositions = symbols.map((symbol) => ({
      left: symbol.offsetLeft,
      top: symbol.offsetTop
    }));

    await fireEvent.click(symbols[0]);

    expect(symbols.map((symbol) => ({ left: symbol.offsetLeft, top: symbol.offsetTop }))).toEqual(
      initialPositions
    );
    const detail = document.querySelector<HTMLElement>('[data-access-detail]')!;
    expect(detail.offsetTop).toBeGreaterThanOrEqual(
      Math.max(...symbols.map((symbol) => symbol.offsetTop + symbol.offsetHeight))
    );
  });

  it('uses the approved labelled pill controls and exact pictograms', () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition],
      copy: catalogues.en
    });
    const symbols = container.querySelectorAll<HTMLButtonElement>('.symbols > .symbol');
    const firstStyle = getComputedStyle(symbols[0]);

    // Every symbol answers in plain words next to its pictogram, so the row
    // reads without hover, click, or icon memory.
    expect(symbols[0].querySelector('.chip-label')?.textContent).toBe('Welcome indoors');
    expect(Number.parseFloat(firstStyle.height)).toBeGreaterThanOrEqual(32);
    expect(firstStyle.borderRadius).toBe('999px');
    expect(firstStyle.backgroundColor).toBe('rgb(220, 231, 225)');
    expect(symbols[0].querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 15 15');
    expect(symbols[0].querySelector('path')?.getAttribute('d')).toContain('M3 7v8H1V7.78');
    expect(symbols[1].querySelector('path')?.getAttribute('d')).toContain('M1.5 3v1.88');
    expect([...symbols].map((symbol) => symbol.dataset.accessIcon)).toEqual([
      'indoors',
      'leash-required',
      'check',
      'check',
      'minus'
    ]);
  });

  it('locks the challenged off-leash, carrier, and small-dog pictograms', () => {
    const offLeash = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [{ ...simpleCondition, restraintCondition: 'off_leash_permitted' as const }],
      copy: catalogues.en
    });
    const offLeashIcon = offLeash.container.querySelector<HTMLElement>(
      '[data-access-icon="off-leash-permitted"]'
    )!;
    expect(offLeashIcon.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 15 15');
    expect(offLeashIcon.querySelector('path')?.getAttribute('d')).toBe(
      'M1.5 3v1.88c0 .69.39 1.31 1 1.62.66-.33 1.38-.5 2.12-.5h2.32L11 10.06v2.73q0 .21.15.36l.7.7q.15.15.15.36v.29c0 .28-.22.5-.5.5h-1.29q-.21 0-.36-.15l-.7-.7Q9 14 9 13.79V11.5c0-.28-.22-.5-.5-.5H5.31c-.19 0-.36.11-.45.28l-.7 1.4c-.1.19-.06.42.09.57l.6.6q.15.15.15.36v.29c0 .28-.22.5-.5.5H3.21q-.21 0-.36-.15l-.7-.7Q2 14 2 13.79V9.21q0-.21-.15-.36l-.97-.97C.32 7.32 0 6.55 0 5.76V5.5c0-.94.47-1.81 1.25-2.33zm9-2c.28 0 .5.22.5.5v1.19c0 .19.11.36.28.45l3.27 1.64c.28.13.45.41.45.72v.09c0 .26-.11.52-.29.7L14 7h-2l-.65 1.29-3.33-3.33 1.84-3.68c.09-.17.26-.28.45-.28z'
    );
    offLeash.unmount();

    const carrier = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [{ ...simpleCondition, restraintCondition: 'carrier_required' as const }],
      copy: catalogues.en
    });
    const carrierIcon = carrier.container.querySelector<HTMLElement>(
      '[data-access-icon="carrier-required"]'
    )!;
    expect(carrierIcon.querySelector('svg')?.getAttribute('viewBox')).toBe('0 -0.5 17 17');
    expect(carrierIcon.querySelector('path')?.getAttribute('d')).toBe(
      'M12.504 3.037h-.535V2.022C11.969 1.458 11.523 1 10.974 1H7.032c-.549 0-.994.458-.994 1.022v1.015h-.543C1.813 3.037 1.001 14.826 1.001 14.826c0 .58.514 1.054 1.147 1.054h13.704c.634 0 1.148-.474 1.148-1.054 0 0-.883-11.789-4.496-11.789ZM6.958 11.017V8.934H11v2.083Zm4.082.983v2H6.988v-2Zm-.009-6.083v2.104H6.958V5.917Zm3.661 2.104h-2.755V5.917h2.125c.251.639.459 1.366.63 2.104Zm-8.661 0H3.285c.165-.729.367-1.473.615-2.104h2.131Zm-.01.913v2.083H2.75c.086-.616.196-1.36.346-2.083Zm5.958-.031H14.9c.153.731.271 1.489.359 2.113h-3.28ZM6.977 2.185c0-.17.148-.309.33-.309H10.7c.182 0 .33.139.33.309v.853H6.977ZM2.517 13.226S2.553 12.776 2.65 12h3.371v2H3.365c-.469 0-.848-.349-.848-.774ZM14.629 14H11.98v-2h3.362c.1.768.141 1.233.141 1.233-.001.422-.385.767-.854.767Z'
    );
    carrier.unmount();

    const smallDog = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [
        {
          ...simpleCondition,
          dogEligibility: { scope: 'restricted' as const, maximumWeightKg: 10 }
        }
      ],
      copy: catalogues.en
    });
    const smallDogIcon = smallDog.container.querySelector<HTMLElement>(
      '[data-access-icon="small-dog"]'
    )!;
    expect(smallDogIcon.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 18 18');
    expect(smallDogIcon.querySelector('g')?.getAttribute('transform')).toBe(
      'translate(1.2 5.2) scale(.58)'
    );
    expect(smallDogIcon.querySelectorAll('path')[1]?.getAttribute('d')).toBe(
      'M15 4v10M13.5 5.5 15 4l1.5 1.5M13.5 12.5 15 14l1.5-1.5'
    );
  });

  it('keeps the first and last full-explanation tooltips inside the viewport', async () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition],
      copy: catalogues.en
    });
    const presentation = container.querySelector<HTMLElement>('.access-presentation')!;
    presentation.style.width = '20rem';
    const symbols = presentation.querySelectorAll<HTMLButtonElement>('.symbols > .symbol');

    await fireEvent.focus(symbols[0]);
    expect(activeTooltip().textContent).toContain('Dogs may enter the indoor customer area.');
    expectContained(activeTooltip(), document.documentElement);
    await fireEvent.blur(symbols[0]);
    await fireEvent.focus(symbols[symbols.length - 1]);
    expectContained(activeTooltip(), document.documentElement);
  });

  it('keeps the complex-condition tooltip inside the viewport above clipping ancestors', async () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition, { ...simpleCondition, accessArea: 'outdoors' as const }],
      copy: catalogues.en
    });
    container.style.height = '18rem';
    container.style.overflowY = 'auto';
    const presentation = container.querySelector<HTMLElement>('.access-presentation')!;
    presentation.style.width = '8rem';
    const complex = presentation.querySelector<HTMLButtonElement>('.complex')!;
    await fireEvent.focus(complex);
    await waitFor(() => expect(activeTooltip().getAttribute('data-open')).toBe('true'));
    const tooltip = activeTooltip();

    // The tooltip slides but never fades, so an accessibility scan can never
    // sample a half-transparent state.
    expect(getComputedStyle(tooltip).transitionProperty).toBe('transform');
    expect(getComputedStyle(tooltip).backgroundColor).toBe('rgb(30, 45, 49)');
    expect(getComputedStyle(tooltip).color).toBe('rgb(251, 252, 249)');
    expect(Number.parseFloat(getComputedStyle(tooltip).borderRadius)).toBeGreaterThan(0);
    expectContained(tooltip, document.documentElement);
    expectVerticallyContained(tooltip, document.documentElement);
  });

  it('keeps a long special-condition tooltip readable above a selected-card scroll body', async () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [
        {
          ...simpleCondition,
          accessArea: 'other_bounded' as const,
          accessAreaNote:
            'Use the covered entrance beside the courtyard and wait for staff before continuing.',
          restraintCondition: 'other_sourced' as const,
          restraintNote: 'Keep your dog close while staff explain the conditions for today.'
        }
      ],
      copy: catalogues.en
    });
    container.setAttribute('data-card-scroll-body', '');
    container.style.width = '20rem';
    container.style.height = '22rem';
    container.style.overflowY = 'auto';
    const presentation = container.querySelector<HTMLElement>('.access-presentation')!;
    const special = presentation.querySelector<HTMLButtonElement>('.symbol.special')!;
    await fireEvent.focus(special);
    await waitFor(() => expect(activeTooltip().getAttribute('data-open')).toBe('true'));
    const tooltip = activeTooltip();

    // The tooltip slides but never fades, so an accessibility scan can never
    // sample a half-transparent state.
    expect(getComputedStyle(tooltip).transitionProperty).toBe('transform');
    expect(tooltip.textContent).toContain('Use the covered entrance beside the courtyard');
    expectContained(tooltip, document.documentElement);
    expectVerticallyContained(tooltip, document.documentElement);
    expect(container.contains(tooltip)).toBe(false);
  });

  it('keeps a long localized tooltip fully readable in a 390px viewport', async () => {
    const initialViewport = { width: window.innerWidth, height: window.innerHeight };
    await browserPage.viewport(390, 844);
    const longNote = `${'Bíðið eftir starfsfólki og fylgið leiðbeiningunum fyrir þennan stað. '.repeat(40)}Lok skýringar.`;

    try {
      const { container } = render(AccessSymbols, {
        placeName: 'Brikk',
        conditions: [
          {
            ...simpleCondition,
            accessArea: 'other_bounded' as const,
            accessAreaNote: longNote
          }
        ],
        copy: catalogues.is
      });
      const special = container.querySelector<HTMLButtonElement>('[data-access-icon="question"]')!;
      special.focus();
      await waitFor(() => expect(activeTooltip().getAttribute('data-open')).toBe('true'));
      const tooltip = activeTooltip();

      expectContained(tooltip, document.documentElement);
      expectVerticallyContained(tooltip, document.documentElement);
      expect(tooltip.scrollWidth).toBeLessThanOrEqual(tooltip.clientWidth);
      expect(tooltip.scrollHeight).toBeGreaterThan(tooltip.clientHeight);
      expect(getComputedStyle(tooltip).pointerEvents).toBe('auto');

      await fireEvent.click(special);
      expect(document.querySelector('[data-access-detail]')?.textContent).toContain(
        'Lok skýringar.'
      );
    } finally {
      await browserPage.viewport(initialViewport.width, initialViewport.height);
    }
  });

  it('dismisses the hover/focus tooltip with Escape without collapsing click details', async () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition],
      copy: catalogues.en
    });
    const first = container.querySelector<HTMLButtonElement>('.symbol')!;

    first.focus();
    await waitFor(() => expect(activeTooltip().getAttribute('data-open')).toBe('true'));
    expect(first.getAttribute('aria-describedby')).toBe(activeTooltip().id);
    await fireEvent.keyDown(first, { key: 'Escape' });
    expect(activeTooltip().getAttribute('data-open')).toBe('false');
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(first);
  });

  it('removes its top-layer tooltip when the symbol group unmounts', async () => {
    const { container, unmount } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition],
      copy: catalogues.en
    });
    const first = container.querySelector<HTMLButtonElement>('.symbol')!;

    await fireEvent.focus(first);
    await waitFor(() => expect(activeTooltip().getAttribute('data-open')).toBe('true'));
    const tooltipId = activeTooltip().id;
    unmount();

    expect(document.getElementById(tooltipId)).toBeNull();
  });

  it('shows a single special-condition control for complex access', async () => {
    const onOpenDetails = vi.fn();
    render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition, { ...simpleCondition, accessArea: 'outdoors' as const }],
      copy: catalogues.en,
      onOpenDetails
    });

    const control = screen.getByRole('button', { name: /Different conditions apply/ });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(control.hasAttribute('aria-controls')).toBe(false);
    await fireEvent.click(control);
    const detailId = control.getAttribute('aria-controls');
    expect(detailId).toBeTruthy();
    expect(onOpenDetails).toHaveBeenCalledOnce();
    expect(document.getElementById(detailId!)?.textContent).toContain(
      '2 different access conditions'
    );
  });

  it('shows full localized English explanations without leaking raw enum values', async () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [
        {
          ...simpleCondition,
          accessArea: 'outdoors' as const,
          accessAreaNote: 'Rear terrace',
          restraintNote: 'Use the short leash by the gate.',
          permissionRequirement: 'ask_on_arrival' as const,
          dogEligibility: {
            scope: 'restricted' as const,
            maximumWeightKg: 10,
            maximumDogs: 2,
            notes: 'Calm dogs only.'
          },
          availabilityState: 'limited' as const,
          availabilityWindow: {
            days: [1, 2],
            startsAt: '10:00',
            endsAt: '16:00',
            startsOn: '2026-06-01',
            endsOn: '2026-08-31',
            notes: 'Weather permitting.'
          }
        }
      ],
      copy: catalogues.en
    });

    const outdoors = container.querySelector<HTMLButtonElement>('button.area')!;
    expect(outdoors.hasAttribute('aria-describedby')).toBe(false);
    expect(outdoors.hasAttribute('aria-controls')).toBe(false);
    await fireEvent.focus(outdoors);
    const tooltip = activeTooltip();
    expect(tooltip.getAttribute('aria-hidden')).toBe('true');
    expect(tooltip.textContent).toContain('Dogs are welcome in the outdoor customer area.');
    expect(tooltip.textContent).toContain('Area detail: Rear terrace.');
    expect(tooltip.textContent).not.toContain('outdoors');
    await fireEvent.focus(outdoors);
    expect(tooltip.getAttribute('aria-hidden')).toBe('true');

    await fireEvent.click(outdoors);
    const detailId = outdoors.getAttribute('aria-controls');
    expect(detailId).toBeTruthy();
    expect(document.getElementById(detailId!)?.textContent).toContain(
      'Dogs are welcome in the outdoor customer area.'
    );

    const restraint = container.querySelector<HTMLButtonElement>('button.restraint')!;
    await fireEvent.click(restraint);
    expect(
      document.getElementById(restraint.getAttribute('aria-controls')!)?.textContent
    ).toContain('Control rule: Use the short leash by the gate.');

    const permission = container.querySelector<HTMLButtonElement>('button.permission')!;
    expect(permission.getAttribute('aria-label')).toBe('Ask on arrival');
    expect(permission.dataset.accessIcon).toBe('ask-on-arrival');
    expect(permission.querySelector('svg')?.innerHTML).toContain('M21 15a4 4');
    await fireEvent.click(permission);
    expect(
      document.getElementById(permission.getAttribute('aria-controls')!)?.textContent
    ).toContain('Ask staff on arrival before bringing a dog in.');

    const dogs = container.querySelector<HTMLButtonElement>('button.dogs')!;
    await fireEvent.click(dogs);
    const dogText = document.getElementById(dogs.getAttribute('aria-controls')!)?.textContent ?? '';
    expect(dogText).toContain('Only dogs within the stated size limit are welcome.');
    expect(dogText).toContain('Maximum weight: 10 kg.');
    expect(dogText).toContain('Maximum number of dogs: 2.');
    expect(dogText).toContain('Dog eligibility: Calm dogs only.');

    const limited = container.querySelector<HTMLButtonElement>('button.timing')!;
    await fireEvent.click(limited);
    const timingText =
      document.getElementById(limited.getAttribute('aria-controls')!)?.textContent ?? '';
    const timingDetailId = limited.getAttribute('aria-controls')!;
    expect(timingText).toContain('Days: Monday, Tuesday.');
    expect(timingText).toContain('From 10:00.');
    expect(timingText).toContain('Until 16:00.');
    expect(timingText).toContain('From 1 June 2026.');
    expect(timingText).toContain('Through 31 August 2026.');
    expect(timingText).toContain('Timing detail: Weather permitting.');
    expect(container.textContent).not.toMatch(
      /outdoors|designated_area|other_bounded|leash_required|off_leash_permitted|carrier_required|other_sourced|standing_permission|ask_on_arrival|advance_approval|whenever_open|not_stated|maximumWeightKg|accessAreaNote|restraintNote|startsAt|endsAt|startsOn|endsOn/
    );

    await fireEvent.click(limited);
    expect(limited.hasAttribute('aria-controls')).toBe(false);
    expect(document.getElementById(timingDetailId)).toBeNull();
  });

  it('shows the same full explanations and constraints in Icelandic', async () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [
        {
          ...simpleCondition,
          accessArea: 'outdoors' as const,
          accessAreaNote: 'Aftari verönd',
          restraintNote: 'Notið stuttan taum við hliðið.',
          permissionRequirement: 'advance_approval' as const,
          dogEligibility: {
            scope: 'restricted' as const,
            maximumWeightKg: 7.5,
            notes: 'Aðeins rólegir hundar.'
          },
          availabilityState: 'limited' as const,
          availabilityWindow: {
            days: [6, 7],
            startsAt: '11:00',
            endsAt: '15:00',
            startsOn: '2026-06-01',
            endsOn: '2026-08-31',
            notes: 'Ef veður leyfir.'
          }
        }
      ],
      copy: catalogues.is
    });

    const outdoors = container.querySelector<HTMLButtonElement>('button.area')!;
    await fireEvent.focus(outdoors);
    expect(activeTooltip().textContent).toContain('Hundar eru velkomnir á útisvæði viðskiptavina.');
    expect(activeTooltip().textContent).toContain('Nánar um svæði: Aftari verönd.');
    await fireEvent.click(outdoors);
    expect(document.getElementById(outdoors.getAttribute('aria-controls')!)?.textContent).toContain(
      'Hundar eru velkomnir á útisvæði viðskiptavina.'
    );

    const restraint = container.querySelector<HTMLButtonElement>('button.restraint')!;
    await fireEvent.click(restraint);
    expect(
      document.getElementById(restraint.getAttribute('aria-controls')!)?.textContent
    ).toContain('Aðhaldsregla: Notið stuttan taum við hliðið.');

    const permission = container.querySelector<HTMLButtonElement>('button.permission')!;
    await fireEvent.click(permission);
    expect(
      document.getElementById(permission.getAttribute('aria-controls')!)?.textContent
    ).toContain('Fáðu leyfi áður en komið er með hund.');

    const dogs = container.querySelector<HTMLButtonElement>('button.dogs')!;
    await fireEvent.click(dogs);
    expect(document.getElementById(dogs.getAttribute('aria-controls')!)?.textContent).toContain(
      'Hámarksþyngd: 7,5 kg.'
    );
    expect(document.getElementById(dogs.getAttribute('aria-controls')!)?.textContent).toContain(
      'Skilyrði um hunda: Aðeins rólegir hundar.'
    );

    const timing = container.querySelector<HTMLButtonElement>('button.timing')!;
    await fireEvent.click(timing);
    const timingText =
      document.getElementById(timing.getAttribute('aria-controls')!)?.textContent ?? '';
    expect(timingText).toContain('Dagar: Laugardagur, Sunnudagur.');
    expect(timingText).toContain('Frá kl. 11:00.');
    expect(timingText).toContain('Til kl. 15:00.');
    expect(timingText).toContain('Gildir frá 1. júní 2026.');
    expect(timingText).toContain('Gildir til og með 31. ágúst 2026.');
    expect(timingText).toContain('Nánar um tíma: Ef veður leyfir.');
    expect(container.textContent).not.toMatch(
      /outdoors|designated_area|other_bounded|leash_required|off_leash_permitted|carrier_required|other_sourced|standing_permission|ask_on_arrival|advance_approval|whenever_open|not_stated|maximumWeightKg|accessAreaNote|restraintNote|startsAt|endsAt|startsOn|endsOn/
    );
  });
});
