import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../src/app.css';
import { catalogues } from '$i18n';
import AccessConditionCorrection from '$lib/discovery/AccessConditionCorrection.svelte';
import type { PublishedAccessFacts } from '$server/discovery/public-places';

const { requestAuthentication } = vi.hoisted(() => ({ requestAuthentication: vi.fn() }));
vi.mock('$lib/auth/controller', () => ({ requestAuthentication }));

const placeId = '30000000-0000-4000-8000-000000000003';
const accessConditionId = '40000000-0000-4000-8000-000000000003';
const legend = 'What applies here?';
const restraintTrigger = /correct the restraint rule/i;
const areaTrigger = /correct where dogs are welcome/i;
const permissionTrigger = /correct the permission needed/i;

function condition(overrides: Partial<PublishedAccessFacts> = {}): PublishedAccessFacts {
  return {
    id: accessConditionId,
    accessArea: 'indoors',
    accessAreaNote: null,
    restraintCondition: 'leash_required',
    restraintNote: null,
    dogEligibility: { scope: 'all_dogs' },
    availabilityWindow: {},
    availabilityState: 'not_stated',
    permissionRequirement: 'standing_permission',
    ...overrides
  };
}

function mount(options: {
  signedIn: boolean;
  announce?: (message: string) => void;
  dimension?: 'restraint' | 'area' | 'permission';
  condition?: Partial<PublishedAccessFacts>;
}) {
  return render(AccessConditionCorrection, {
    placeId,
    placeName: 'Brikk',
    lang: 'en' as const,
    copy: catalogues.en,
    signedIn: options.signedIn,
    condition: condition(options.condition),
    dimension: options.dimension ?? 'restraint',
    announce: options.announce ?? (() => undefined)
  });
}

function submittedResponse(): Response {
  return new Response(JSON.stringify({ status: 'submitted', flagId: 'flag-1' }));
}

function labelFor(
  restraint: 'leash_required' | 'off_leash_permitted' | 'carrier_required'
): string {
  return {
    leash_required: 'Leash required',
    off_leash_permitted: 'Off-leash allowed',
    carrier_required: 'Carrier required'
  }[restraint];
}

function areaLabelFor(area: 'indoors' | 'outdoors' | 'designated_area'): string {
  return {
    indoors: 'Welcome indoors',
    outdoors: 'Outdoors only',
    designated_area: 'A designated area only'
  }[area];
}

async function openEditor(trigger: RegExp = restraintTrigger): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: trigger }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  requestAuthentication.mockReset();
});

describe('AccessConditionCorrection', () => {
  it('stays collapsed until the member asks to correct something', () => {
    mount({ signedIn: true });

    expect(screen.getByRole('button', { name: restraintTrigger })).toBeTruthy();
    expect(screen.queryByRole('group', { name: legend })).toBeNull();
  });

  it('offers a real radio group seeded from the current restraint and focuses it on open', async () => {
    mount({ signedIn: true });
    await openEditor();

    expect(screen.getByRole('group', { name: legend })).toBeTruthy();
    const current = screen.getByRole('radio', { name: 'Leash required' });
    expect(current).toBeChecked();
    await waitFor(() => expect(document.activeElement).toBe(current));
  });

  it('never offers other stated conditions, which needs a sourced note', async () => {
    mount({ signedIn: true });
    await openEditor();

    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'leash_required',
      'off_leash_permitted',
      'carrier_required'
    ]);
  });

  it('keeps confirm disabled while the value is unchanged', async () => {
    mount({ signedIn: true });
    await openEditor();

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await fireEvent.click(screen.getByRole('radio', { name: 'Off-leash allowed' }));
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });

  it('opens the auth dialog and sends nothing when the member is signed out', async () => {
    const fetchSpy = vi.fn(async () => submittedResponse());
    vi.stubGlobal('fetch', fetchSpy);
    mount({ signedIn: false });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Off-leash allowed' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(requestAuthentication).toHaveBeenCalledWith({ origin: 'contribution' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends exactly one request naming the condition, the dimension, the value and the note', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return submittedResponse();
      })
    );
    mount({ signedIn: true });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Carrier required' }));
    await fireEvent.input(screen.getByRole('textbox', { name: 'Anything to add? (optional)' }), {
      target: { value: 'Staff asked me to carry my dog.' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe(`/api/places/${placeId}/corrections?lang=en`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'restraint',
      value: 'carrier_required',
      note: 'Staff asked me to carry my dog.'
    });
    expect(requestAuthentication).not.toHaveBeenCalled();
  });

  it('announces success, collapses, and returns focus to the trigger', async () => {
    const announcements: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => submittedResponse())
    );
    mount({ signedIn: true, announce: (message) => announcements.push(message) });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Off-leash allowed' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.queryByRole('group', { name: legend })).toBeNull());
    expect(announcements).toContain('Thank you. A Moderator will check this.');
    const trigger = screen.getByRole('button', { name: restraintTrigger });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('reports a rate limit in its own words rather than as a generic failure', async () => {
    const announcements: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 429 }))
    );
    mount({ signedIn: true, announce: (message) => announcements.push(message) });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Off-leash allowed' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('You have sent several corrections recently. Please try again later.')
    ).toBeTruthy();
    expect(announcements).toContain(
      'You have sent several corrections recently. Please try again later.'
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('keeps the editor open on failure so the member can retry without retyping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 }))
    );
    mount({ signedIn: true });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Off-leash allowed' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('That did not send. Try again.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Off-leash allowed' })).toBeChecked();
  });

  it('reports a server-side unchanged verdict even though confirm was enabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'unchanged' })))
    );
    mount({ signedIn: true });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Off-leash allowed' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('That is already what we have on file.')).toBeTruthy();
  });

  it('sends only once while a request is still in flight', async () => {
    let resolveSend: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveSend = resolve;
    });
    const fetchSpy = vi.fn(async () => pending);
    vi.stubGlobal('fetch', fetchSpy);
    mount({ signedIn: true });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Off-leash allowed' }));
    const send = screen.getByRole('button', { name: 'Send' });
    await fireEvent.click(send);
    await fireEvent.click(send);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    resolveSend(submittedResponse());
  });

  it('closes on Escape and stops the key from reaching the chip behind it', async () => {
    const reachedOuterListener = vi.fn();
    document.addEventListener('keydown', reachedOuterListener);
    mount({ signedIn: true });
    await openEditor();

    screen
      .getByRole('radio', { name: 'Leash required' })
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(reachedOuterListener).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('group', { name: legend })).toBeNull());
    document.removeEventListener('keydown', reachedOuterListener);
  });

  it.each(['leash_required', 'off_leash_permitted', 'carrier_required'] as const)(
    'focuses the checked option, not the first, when the current rule is %s',
    async (current) => {
      mount({ signedIn: true, condition: { restraintCondition: current } });
      await openEditor();

      const checked = screen.getByRole('radio', { name: labelFor(current) });
      expect(checked).toBeChecked();
      await waitFor(() => expect(document.activeElement).toBe(checked));
    }
  );

  it('checks nothing and disables send when the current rule is not offerable', async () => {
    // other_sourced needs a sourced restraint note, so the group cannot represent it. Pre-checking
    // a substitute would state a rule the place does not have and arm send on a stray click.
    mount({ signedIn: true, condition: { restraintCondition: 'other_sourced' } });
    await openEditor();

    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('announces a repeated identical failure again rather than falling silent', async () => {
    const announcements: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 }))
    );
    mount({ signedIn: true, announce: (message) => announcements.push(message) });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Off-leash allowed' }));
    const send = screen.getByRole('button', { name: 'Send' });
    await fireEvent.click(send);
    await waitFor(() => expect(announcements).toHaveLength(1));
    await fireEvent.click(send);

    await waitFor(() => expect(announcements).toHaveLength(2));
    expect(announcements).toEqual([
      'That did not send. Try again.',
      'That did not send. Try again.'
    ]);
  });

  it('keeps both quiet controls above the minimum pointer target size', async () => {
    mount({ signedIn: true });
    const start = screen.getByRole('button', { name: restraintTrigger });
    expect(start.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);

    await openEditor();
    expect(
      screen.getByRole('button', { name: 'Cancel' }).getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(24);
  });

  it('caps the note so a long paste cannot be silently rejected by the server', async () => {
    mount({ signedIn: true });
    await openEditor();

    expect(screen.getByRole('textbox', { name: 'Anything to add? (optional)' })).toHaveAttribute(
      'maxlength',
      '280'
    );
  });

  it('reseeds from the published value when the editor is reopened', async () => {
    mount({ signedIn: true });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Carrier required' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await openEditor();

    expect(screen.getByRole('radio', { name: 'Leash required' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('clears a typed note when the editor is reopened', async () => {
    mount({ signedIn: true });
    await openEditor();
    await fireEvent.input(screen.getByRole('textbox', { name: 'Anything to add? (optional)' }), {
      target: { value: 'The manager told me.' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await openEditor();

    expect(screen.getByRole('textbox', { name: 'Anything to add? (optional)' })).toHaveValue('');
  });
});

describe('AccessConditionCorrection on the area dimension', () => {
  it('names the fact it corrects in the trigger, not just "not right?"', () => {
    mount({ signedIn: true, dimension: 'area' });

    expect(
      screen.getByRole('button', { name: 'Not right? Correct where dogs are welcome at Brikk' })
    ).toBeTruthy();
  });

  it('offers the three areas a member can state and never other_bounded', async () => {
    mount({ signedIn: true, dimension: 'area' });
    await openEditor(areaTrigger);

    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'indoors',
      'outdoors',
      'designated_area'
    ]);
  });

  it.each(['indoors', 'outdoors', 'designated_area'] as const)(
    'seeds and focuses the current area when it is %s',
    async (current) => {
      mount({ signedIn: true, dimension: 'area', condition: { accessArea: current } });
      await openEditor(areaTrigger);

      const checked = screen.getByRole('radio', { name: areaLabelFor(current) });
      expect(checked).toBeChecked();
      await waitFor(() => expect(document.activeElement).toBe(checked));
    }
  );

  it('checks nothing and disables send when the current area is not offerable', async () => {
    // other_bounded only means anything alongside its sourced note, so the group cannot state it.
    mount({ signedIn: true, dimension: 'area', condition: { accessArea: 'other_bounded' } });
    await openEditor(areaTrigger);

    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('sends the area dimension and its value, not a restraint', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return submittedResponse();
      })
    );
    mount({ signedIn: true, dimension: 'area' });
    await openEditor(areaTrigger);
    await fireEvent.click(screen.getByRole('radio', { name: 'Outdoors only' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'area',
      value: 'outdoors',
      note: null
    });
  });

  it('keeps confirm disabled while the area is unchanged', async () => {
    mount({ signedIn: true, dimension: 'area' });
    await openEditor(areaTrigger);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await fireEvent.click(screen.getByRole('radio', { name: 'A designated area only' }));
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });

  it('opens the auth dialog and sends nothing when the member is signed out', async () => {
    const fetchSpy = vi.fn(async () => submittedResponse());
    vi.stubGlobal('fetch', fetchSpy);
    mount({ signedIn: false, dimension: 'area' });
    await openEditor(areaTrigger);
    await fireEvent.click(screen.getByRole('radio', { name: 'Outdoors only' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(requestAuthentication).toHaveBeenCalledWith({ origin: 'contribution' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('closes on Escape and stops the key from reaching the chip behind it', async () => {
    const reachedOuterListener = vi.fn();
    document.addEventListener('keydown', reachedOuterListener);
    mount({ signedIn: true, dimension: 'area' });
    await openEditor(areaTrigger);

    screen
      .getByRole('radio', { name: 'Welcome indoors' })
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(reachedOuterListener).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('group', { name: legend })).toBeNull());
    document.removeEventListener('keydown', reachedOuterListener);
  });

  it('announces success, collapses, and returns focus to its own trigger', async () => {
    const announcements: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => submittedResponse())
    );
    mount({
      signedIn: true,
      dimension: 'area',
      announce: (message) => announcements.push(message)
    });
    await openEditor(areaTrigger);
    await fireEvent.click(screen.getByRole('radio', { name: 'Outdoors only' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.queryByRole('group', { name: legend })).toBeNull());
    expect(announcements).toContain('Thank you. A Moderator will check this.');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: areaTrigger }))
    );
  });
});

describe('AccessConditionCorrection on the permission dimension', () => {
  it('offers every permission a place can hold, because none of them needs a sourced note', async () => {
    mount({ signedIn: true, dimension: 'permission' });
    await openEditor(permissionTrigger);

    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'standing_permission',
      'ask_on_arrival',
      'advance_approval'
    ]);
  });

  it('reuses the chip copy the member just tapped, and names what the chips flatten', async () => {
    mount({ signedIn: true, dimension: 'permission' });
    await openEditor(permissionTrigger);

    // The first two are the chip labels themselves. Advance approval has no chip of its own -- the
    // chips show it as "special conditions" -- so it is named directly rather than borrowed from a
    // label that means something broader.
    expect(screen.getByRole('radio', { name: 'Generally welcome' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Ask on arrival' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Approval needed in advance' })).toBeTruthy();
  });

  it.each(['standing_permission', 'ask_on_arrival', 'advance_approval'] as const)(
    'seeds and focuses the current permission when it is %s',
    async (current) => {
      mount({
        signedIn: true,
        dimension: 'permission',
        condition: { permissionRequirement: current }
      });
      await openEditor(permissionTrigger);

      const checked = screen.getByRole('radio', {
        name: {
          standing_permission: 'Generally welcome',
          ask_on_arrival: 'Ask on arrival',
          advance_approval: 'Approval needed in advance'
        }[current]
      });
      expect(checked).toBeChecked();
      await waitFor(() => expect(document.activeElement).toBe(checked));
    }
  );

  it('sends the permission dimension and its value', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return submittedResponse();
      })
    );
    mount({ signedIn: true, dimension: 'permission' });
    await openEditor(permissionTrigger);
    await fireEvent.click(screen.getByRole('radio', { name: 'Ask on arrival' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'permission',
      value: 'ask_on_arrival',
      note: null
    });
  });

  it('keeps confirm disabled while the permission is unchanged', async () => {
    mount({ signedIn: true, dimension: 'permission' });
    await openEditor(permissionTrigger);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await fireEvent.click(screen.getByRole('radio', { name: 'Approval needed in advance' }));
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });
});
