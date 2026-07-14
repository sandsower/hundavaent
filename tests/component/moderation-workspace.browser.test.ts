import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import ModerationWorkspace from '$lib/moderation/ModerationWorkspace.svelte';

const suggestionOne = '11111111-1111-4111-8111-111111111111';
const suggestionTwo = '22222222-2222-4222-8222-222222222222';

const queues = [
  { id: 'suggestions', count: 3 },
  { id: 'corrections-and-reports', count: 2 },
  { id: 'candidate-places', count: 2 }
] as const;

const items = [
  {
    id: suggestionOne,
    title: 'Kaffi Lóa',
    summary: 'New café suggestion in Reykjavík',
    statusLabel: 'New',
    meta: 'Submitted 12 minutes ago'
  },
  {
    id: suggestionTwo,
    title: 'Sundhöll Hafnarfjarðar',
    summary: 'Pool entrance and access details',
    statusLabel: 'Priority',
    meta: 'Submitted yesterday',
    priority: true
  }
] as const;

function readyProps() {
  return {
    copy: catalogues.en,
    baseHref: '/en/moderation',
    queues,
    activeQueueId: 'suggestions' as const,
    items,
    selectedItemId: suggestionOne,
    filters: ['actionable'] as const,
    cursor: null,
    cursorTrail: [] as const,
    nextCursor: null,
    hasPrevious: false,
    statusMessage: 'Decision saved. Next item loaded.',
    decisionContent: createRawSnippet(() => ({
      render: () => '<button type="button">Resolve and next</button>'
    }))
  };
}

describe('Compact moderation workspace', () => {
  it('renders all real queues with accurate counts and query-backed selection links', () => {
    render(ModerationWorkspace, readyProps());

    const queueNavigation = screen.getByRole('navigation', { name: 'Moderation queues' });
    const expectedQueues = [
      ['Suggestions', '3', 'suggestions'],
      ['Corrections and reports', '2', 'corrections-and-reports'],
      ['Candidate places', '2', 'candidate-places']
    ] as const;

    for (const [label, count, queueId] of expectedQueues) {
      const link = within(queueNavigation).getByRole('link', { name: `${label} ${count}` });
      expect(link.getAttribute('href')).toBe(`/en/moderation?queue=${queueId}&filter=actionable`);
    }

    expect(
      within(queueNavigation)
        .getByRole('link', { name: 'Suggestions 3' })
        .getAttribute('aria-current')
    ).toBe('page');

    const selectedItem = screen.getByRole('link', { name: /Kaffi Lóa/ });
    expect(selectedItem.getAttribute('aria-current')).toBe('true');
    expect(selectedItem.getAttribute('href')).toBe(
      `/en/moderation?queue=suggestions&item=${suggestionOne}&filter=actionable`
    );
    expect(screen.queryByRole('link', { name: 'Priority' })).toBeNull();
    expect(screen.getByText('J next / K previous')).toBeTruthy();
  });

  it('keeps review, live status, and decision controls on the working surface', () => {
    render(ModerationWorkspace, readyProps());

    expect(screen.getByRole('region', { name: 'Selected moderation queue' })).toBeTruthy();
    const review = screen.getByRole('region', { name: 'Selected moderation item' });
    expect(within(review).getByRole('heading', { name: 'Kaffi Lóa' })).toBeTruthy();
    expect(within(review).getByText('New café suggestion in Reykjavík')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Decision saved. Next item loaded.');
    expect(screen.getByRole('region', { name: 'Decision controls' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resolve and next' })).toBeTruthy();
  });

  it('preserves cursor history across item selection and previous/next page links', () => {
    render(ModerationWorkspace, {
      ...readyProps(),
      statusMessage: '',
      cursor: 'page_2',
      cursorTrail: [null],
      nextCursor: 'page_3',
      hasPrevious: true
    });

    expect(screen.getByRole('link', { name: /Kaffi Lóa/ }).getAttribute('href')).toBe(
      `/en/moderation?queue=suggestions&item=${suggestionOne}&filter=actionable&cursor=page_2&back=first`
    );
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe(
      '/en/moderation?queue=suggestions&filter=actionable&select=last'
    );
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      '/en/moderation?queue=suggestions&filter=actionable&cursor=page_3&back=first&back=page_2'
    );
  });

  it('supports J and K item navigation without intercepting text input', async () => {
    render(ModerationWorkspace, { ...readyProps(), statusMessage: '' });
    const secondItem = screen.getByRole('link', { name: /Sundhöll Hafnarfjarðar/ });
    const click = vi.spyOn(secondItem, 'click').mockImplementation(() => undefined);

    await fireEvent.keyDown(window, { key: 'j' });
    expect(click).toHaveBeenCalledOnce();

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await fireEvent.keyDown(input, { key: 'j' });
    expect(click).toHaveBeenCalledOnce();
    input.remove();
  });

  it('uses K from the first item on a page to select the adjacent item on the previous page', async () => {
    render(ModerationWorkspace, {
      ...readyProps(),
      statusMessage: '',
      cursor: 'page_2',
      cursorTrail: [null],
      nextCursor: 'page_3',
      hasPrevious: true
    });
    const previousPage = screen.getByRole('link', { name: 'Previous page' });
    const click = vi.spyOn(previousPage, 'click').mockImplementation(() => undefined);

    await fireEvent.keyDown(window, { key: 'k' });

    expect(click).toHaveBeenCalledOnce();
    expect(previousPage.getAttribute('href')).toBe(
      '/en/moderation?queue=suggestions&filter=actionable&select=last'
    );
  });

  it('restores focus to the selected successor after a saved decision', async () => {
    render(ModerationWorkspace, readyProps());
    const selectedItem = screen.getByRole('link', { name: /Kaffi Lóa/ });

    await waitFor(() => expect(document.activeElement).toBe(selectedItem));
  });

  it('focuses the next actionable sub-work control for a nonterminal continuation', async () => {
    render(ModerationWorkspace, {
      ...readyProps(),
      focusTargetId: 'next-field',
      decisionContent: createRawSnippet(() => ({
        render: () =>
          '<form id="next-field"><select aria-label="Next field"><option>Ready</option></select></form>'
      }))
    });

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Next field' }))
    );
  });

  it('keeps the work list usable while disabling stale actions after a refresh failure', () => {
    render(ModerationWorkspace, {
      ...readyProps(),
      statusMessage: '',
      reviewErrorMessage: 'Current facts could not be loaded after the conflict.',
      actionsDisabled: true,
      reviewContent: createRawSnippet(() => ({
        render: () => '<form method="POST"><button type="submit">Save outcome</button></form>'
      }))
    });

    expect(screen.getByRole('link', { name: /Kaffi Lóa/ })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'Current facts could not be loaded after the conflict.'
    );
    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toContain(
      `item=${suggestionOne}`
    );
    expect(screen.getByRole('button', { name: 'Save outcome' }).matches(':disabled')).toBe(true);
  });

  it('does not render an empty decision dock when selected review details fail to load', () => {
    render(ModerationWorkspace, {
      ...readyProps(),
      statusMessage: '',
      reviewErrorMessage: 'The selected review could not be loaded.',
      showDecisionDock: false
    });

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Decision controls' })).toBeNull();
  });

  it('adds current-page and successor context to moderation decision forms', async () => {
    render(ModerationWorkspace, {
      ...readyProps(),
      statusMessage: '',
      cursor: 'page_2',
      cursorTrail: [null],
      nextCursor: 'page_3',
      decisionContent: createRawSnippet(() => ({
        render: () => '<form method="POST"><button type="submit">Save</button></form>'
      }))
    });

    const form = screen.getByRole('button', { name: 'Save' }).closest('form');
    await waitFor(() => {
      expect(new FormData(form!).get('workspaceCursor')).toBe('page_2');
      expect(new FormData(form!).getAll('workspaceBack')).toEqual(['first']);
      expect(new FormData(form!).get('workspaceNextItemId')).toBe(suggestionTwo);
      expect(new FormData(form!).get('workspaceNextCursor')).toBe('page_3');
    });
  });

  it('renders a compact empty queue without inventing an item selection', () => {
    render(ModerationWorkspace, {
      ...readyProps(),
      items: [],
      selectedItemId: null
    });

    expect(screen.getByRole('heading', { name: 'Queue complete' })).toBeTruthy();
    expect(screen.getByText('No actionable items are waiting in this queue.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Choose an item to review' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Decision controls' })).toBeNull();
  });

  it('preserves the shell and offers an in-place retry when the active queue fails', () => {
    render(ModerationWorkspace, {
      ...readyProps(),
      items: [],
      selectedItemId: null,
      errorMessage: 'Suggestions could not be loaded.'
    });

    expect(screen.getByRole('navigation', { name: 'Moderation queues' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Suggestions could not be loaded.');
    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe(
      '/en/moderation?queue=suggestions&filter=actionable'
    );
  });
});
