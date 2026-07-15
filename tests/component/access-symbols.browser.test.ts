import { fireEvent, render, screen } from '@testing-library/svelte';
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
    expect(screen.getByRole('status').textContent).toContain('does not imply permission');
  });

  it('keeps the first and last symbol tooltips inside the AccessSymbols bounds', () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition],
      copy: catalogues.en
    });
    const presentation = container.querySelector<HTMLElement>('.access-presentation')!;
    presentation.style.width = '20rem';
    const symbols = presentation.querySelectorAll<HTMLButtonElement>('.symbols > .symbol');

    expectContained(symbols[0].querySelector('[role="tooltip"]')!, presentation);
    expectContained(symbols[symbols.length - 1].querySelector('[role="tooltip"]')!, presentation);
  });

  it('keeps the complex-condition tooltip inside narrow AccessSymbols bounds', () => {
    const { container } = render(AccessSymbols, {
      placeName: 'Brikk',
      conditions: [simpleCondition, { ...simpleCondition, accessArea: 'outdoors' as const }],
      copy: catalogues.en
    });
    const presentation = container.querySelector<HTMLElement>('.access-presentation')!;
    presentation.style.width = '8rem';

    expectContained(presentation.querySelector('.complex [role="tooltip"]')!, presentation);
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
    const tooltip = outdoors.querySelector('[role="tooltip"]');
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true');
    expect(tooltip?.textContent).toContain('Dogs are welcome in the outdoor customer area.');
    expect(tooltip?.textContent).toContain('Area detail: Rear terrace.');
    expect(tooltip?.textContent).not.toContain('outdoors');
    await fireEvent.focus(outdoors);
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true');

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
    expect(outdoors.querySelector('[role="tooltip"]')?.textContent).toContain(
      'Hundar eru velkomnir á útisvæði viðskiptavina.'
    );
    expect(outdoors.querySelector('[role="tooltip"]')?.textContent).toContain(
      'Nánar um svæði: Aftari verönd.'
    );
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
