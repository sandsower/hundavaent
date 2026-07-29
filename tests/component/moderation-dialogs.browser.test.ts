import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import ModerationPublishDialog from '$lib/moderation/ModerationPublishDialog.svelte';
import ModerationReasonDialog from '$lib/moderation/ModerationReasonDialog.svelte';

// The native `cancel` event a real Escape press fires on a <dialog>. Testing-library's synthetic
// keyboard events are not trusted, so the browser never runs its own Escape-to-cancel behaviour
// for them; dispatching the event Dialog's oncancel attribute actually listens for is the reliable
// way to exercise the same code path a real Escape press would reach. Copied from
// tests/component/dialog.browser.test.ts, which established the pattern for the primitive itself.
function pressEscape(dialog: HTMLDialogElement): void {
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
}

function publishDialogProps(open: boolean) {
  return {
    open,
    title: 'Publish this Place?',
    description: 'The Place will become visible to the public.',
    reasonLabel: 'Reason',
    reasonHelp: 'Shown to the contributor.',
    confirmLabel: 'Publish',
    cancelLabel: 'Cancel',
    onconfirm: vi.fn(),
    oncancel: vi.fn()
  };
}

describe('ModerationPublishDialog', () => {
  // Pins the reopen-reset $effect (`$effect(() => { if (open) reason = ''; })`) that replaced the
  // pre-migration showModal-branch reset: the field must not leak a draft reason across a
  // closed -> open cycle even though this dialog stays mounted with `open` merely toggling.
  it('resets the reason textarea on every closed -> open transition', async () => {
    const { rerender } = render(ModerationPublishDialog, publishDialogProps(true));

    const textarea = screen.getByLabelText('Reason') as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: 'Looks ready to publish.' } });
    expect(textarea.value).toBe('Looks ready to publish.');

    await rerender(publishDialogProps(false));
    await rerender(publishDialogProps(true));

    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('ModerationReasonDialog', () => {
  // Documents the deliberate contract from Dialog's own oncancel prop comment: Escape is always
  // intercepted and, when oncancel is supplied, handed straight to the caller with no other
  // decision made here - so even mid-submit (submitting=true, which only disables the confirm
  // button) Escape still reaches the consumer. The primitive does not gate cancellation on
  // submission state; that judgment call belongs entirely to whoever wires oncancel.
  it('routes Escape to oncancel even while submitting', async () => {
    const oncancel = vi.fn();
    render(ModerationReasonDialog, {
      open: true,
      title: 'Reject this suggestion?',
      description: 'The contributor will be notified.',
      confirmLabel: 'Reject',
      cancelLabel: 'Keep reviewing',
      reasonIsLabel: 'Ástæða á íslensku',
      reasonEnLabel: 'Reason in English',
      privateNoteLabel: 'Private note',
      submitting: true,
      onconfirm: vi.fn(),
      oncancel
    });

    const dialog = await screen.findByRole('dialog');
    pressEscape(dialog as HTMLDialogElement);

    expect(oncancel).toHaveBeenCalledTimes(1);
  });
});
