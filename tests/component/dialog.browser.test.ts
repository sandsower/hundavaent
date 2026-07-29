import { Dialog } from '@hundavaent/design-system';
import { render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { page as browserPage } from 'vitest/browser';

// app.css is the app's real CSS entrypoint and already imports @hundavaent/design-system/theme.css
// - so loading it here pulls in both the plain --hv-* custom properties (tokens.css) and the
// Tailwind utility layer Dialog is built from, the same way button.browser.test.ts loads it for
// its own computed-style assertions.
import '../../src/app.css';

function content(text: string) {
  return createRawSnippet(() => ({ render: () => text }));
}

function htmlContent(html: string) {
  return createRawSnippet(() => ({ render: () => html }));
}

// Resolves a size expression through the browser's own computation rather than hardcoding a
// literal pixel value: a probe element sits next to the rendered Dialog and asks for the same
// inline-size expression, so the assertion is about parity with the contract's expression, not
// about a value that will drift with the viewport or root font size. Same probe pattern as
// button.browser.test.ts's resolvedMinHeight/resolvedBorderRadius.
function resolvedInlineSize(expression: string): string {
  const probe = document.createElement('div');
  probe.style.setProperty('inline-size', expression);
  document.body.append(probe);
  const value = getComputedStyle(probe).width;
  probe.remove();
  return value;
}

function resolvedPanelPadding(): string {
  const probe = document.createElement('div');
  probe.style.padding = 'var(--hv-space-panel)';
  document.body.append(probe);
  const value = getComputedStyle(probe).paddingTop;
  probe.remove();
  return value;
}

// The native `cancel` event a real Escape press fires on a <dialog>. Testing-library's
// synthetic keyboard events are not trusted, so the browser never runs its own Escape-to-cancel
// behaviour for them; dispatching the event Dialog's oncancel attribute actually listens for is
// the reliable way to exercise the same code path a real Escape press would reach.
function pressEscape(dialog: HTMLDialogElement): void {
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
}

describe('Dialog', () => {
  it('mounts a visible dialog when open is true and removes it when open is false', async () => {
    const { rerender } = render(Dialog, {
      open: true,
      title: content('Title'),
      children: content('Body')
    });

    const dialog = await screen.findByRole('dialog');
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog.hasAttribute('open')).toBe(true);

    await rerender({ open: false, title: content('Title'), children: content('Body') });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('points aria-labelledby at the rendered title when using the title snippet', async () => {
    render(Dialog, { open: true, title: content('My Title'), children: content('Body') });

    const dialog = await screen.findByRole('dialog');
    const labelledbyId = dialog.getAttribute('aria-labelledby');
    expect(labelledbyId).toBeTruthy();
    const titleElement = document.getElementById(labelledbyId!);
    expect(titleElement?.textContent?.trim()).toBe('My Title');
  });

  it('points aria-labelledby at the consumer-owned element when using labelledby', async () => {
    render(Dialog, {
      open: true,
      labelledby: 'custom-title',
      children: htmlContent('<h2 id="custom-title">Custom Heading</h2><p>Body</p>')
    });

    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('custom-title');
    expect(screen.getByText('Custom Heading').id).toBe('custom-title');
  });

  it('closes on Escape when no oncancel is given, firing onclose exactly once', async () => {
    const onclose = vi.fn();
    render(Dialog, { open: true, title: content('Title'), children: content('Body'), onclose });

    const dialog = await screen.findByRole('dialog');
    pressEscape(dialog as HTMLDialogElement);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('defers to oncancel on Escape and does not close itself', async () => {
    const oncancel = vi.fn();
    const onclose = vi.fn();
    render(Dialog, {
      open: true,
      title: content('Title'),
      children: content('Body'),
      oncancel,
      onclose
    });

    const dialog = await screen.findByRole('dialog');
    pressEscape(dialog as HTMLDialogElement);

    expect(oncancel).toHaveBeenCalledTimes(1);
    expect(onclose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('restores focus to the element that was focused before opening', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';
    document.body.append(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    try {
      const { rerender } = render(Dialog, {
        open: true,
        title: content('Title'),
        children: content('Body')
      });

      await screen.findByRole('dialog');
      expect(document.activeElement).not.toBe(trigger);

      await rerender({ open: false, title: content('Title'), children: content('Body') });

      await waitFor(() => expect(document.activeElement).toBe(trigger));
    } finally {
      trigger.remove();
    }
  });

  it('fires onclose exactly once when the parent flips open to false programmatically', async () => {
    const onclose = vi.fn();
    const { rerender } = render(Dialog, {
      open: true,
      title: content('Title'),
      children: content('Body'),
      onclose
    });
    await screen.findByRole('dialog');

    await rerender({ open: false, title: content('Title'), children: content('Body'), onclose });

    await waitFor(() => expect(onclose).toHaveBeenCalledTimes(1));

    // A second rerender that keeps open at false must not re-fire onclose: the {#if} block only
    // mounts/tears down the dialog on an actual open transition, not on every prop update.
    await rerender({ open: false, title: content('Title'), children: content('Body'), onclose });
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['compact' as const, 'min(calc(100% - 2rem), 30rem)'],
    ['standard' as const, 'min(calc(100% - 2rem), 34rem)'],
    ['roomy' as const, 'min(calc(100% - 2rem), 38rem)'],
    ['wide' as const, 'min(calc(100% - 2rem), 42rem)']
  ])('resolves the %s size to its inline-size expression', async (size, expression) => {
    render(Dialog, { open: true, size, title: content('Title'), children: content('Body') });

    const dialog = await screen.findByRole('dialog');
    expect(getComputedStyle(dialog).width).toBe(resolvedInlineSize(expression));
  });

  it('pads the panel by default and removes padding when unpadded', async () => {
    const { rerender } = render(Dialog, {
      open: true,
      title: content('Title'),
      children: content('Body')
    });

    const paddedDialog = await screen.findByRole('dialog');
    expect(getComputedStyle(paddedDialog).paddingTop).toBe(resolvedPanelPadding());

    await rerender({
      open: true,
      unpadded: true,
      title: content('Title'),
      children: content('Body')
    });

    const unpaddedDialog = await screen.findByRole('dialog');
    expect(getComputedStyle(unpaddedDialog).paddingTop).toBe('0px');
  });

  // Pins the mobile-sheet geometry this primitive is meant to reproduce from AuthDialog's shipped
  // block (src/lib/auth/AuthDialog.svelte's @media (max-width: 42rem) rule) - the same computed
  // values tests/component/auth-dialog.browser.test.ts:147 pins at the same viewport.
  it('pins to 1rem from both edges as a bottom sheet under the mobile breakpoint', async () => {
    const initialViewport = { width: window.innerWidth, height: window.innerHeight };
    await browserPage.viewport(390, 844);

    try {
      render(Dialog, { open: true, title: content('Title'), children: content('Body') });
      const dialog = await screen.findByRole('dialog');
      const styles = getComputedStyle(dialog);

      expect(styles.left).toBe('16px');
      expect(styles.right).toBe('16px');
      expect(styles.marginInlineStart).toBe('0px');
      expect(styles.marginInlineEnd).toBe('0px');
      expect(styles.marginBottom).toBe('16px');
    } finally {
      await browserPage.viewport(initialViewport.width, initialViewport.height);
    }
  });
});
