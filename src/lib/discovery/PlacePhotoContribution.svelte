<script lang="ts">
  import type { Catalogue } from '$i18n';
  import { requestAuthentication } from '$lib/auth/controller';
  import {
    acceptedMemberPhotoTypes,
    isAcceptedMemberPhotoType,
    maxMemberPhotoBytes,
    type MemberPlacePhoto
  } from '$lib/contributions/photo';
  import { uploadPlacePhoto } from '$lib/contributions/photo-client';

  /**
   * "Add a photo" on the photo surface itself: a photo is an additive gift rather than a defect
   * report, so it is not filed behind the correction reveal, and it is visible to a signed-out
   * reader. The gate fires at the moment of action, exactly as the inline correction editors do,
   * because a magic link can land in a different browser and nothing here could be replayed.
   *
   * There is nothing to write. No caption and no alt text are asked for: approval already forces a
   * Moderator to author alt text in both locales before anything is published, and a Member's own
   * words on an unreviewed photo would be a second thing to moderate.
   */
  interface Props {
    placeId: string;
    placeName: string;
    copy: Catalogue;
    signedIn: boolean;
    announce?: (message: string) => void;
    /** Reports what was accepted, so the strip can show the pending tile without waiting. */
    onSubmitted?: (photo: MemberPlacePhoto) => void;
  }

  let {
    placeId,
    placeName,
    copy,
    signedIn,
    announce = () => undefined,
    onSubmitted = () => undefined
  }: Props = $props();

  let picker = $state<HTMLInputElement>();
  let sending = $state(false);
  let outcome = $state<'too_large' | 'wrong_type' | 'rate_limited' | 'failed' | null>(null);
  let attempt = $state(0);
  let confirmed = $state(false);

  const megabyteCap = Math.floor(maxMemberPhotoBytes / (1024 * 1024));
  const outcomeMessage = $derived(
    outcome === 'too_large'
      ? copy['place.photos.tooLarge'].replace('{size}', String(megabyteCap))
      : outcome === 'wrong_type'
        ? copy['place.photos.wrongType']
        : outcome === 'rate_limited'
          ? copy['place.photos.rateLimited']
          : outcome === 'failed'
            ? copy['place.photos.failed']
            : null
  );

  function choose(): void {
    if (sending) return;
    if (!signedIn) {
      // Required rather than deferred, and before the picker opens: a file chosen now could not be
      // carried across a sign-in that finishes in another browser.
      requestAuthentication({ origin: 'contribution' });
      return;
    }
    outcome = null;
    confirmed = false;
    picker?.click();
  }

  async function send(): Promise<void> {
    const file = picker?.files?.[0];
    // The control is reset before anything else so choosing the same file twice is two events.
    if (picker) picker.value = '';
    if (!file) return;

    if (!isAcceptedMemberPhotoType(file.type)) {
      fail('wrong_type');
      return;
    }
    if (file.size > maxMemberPhotoBytes) {
      fail('too_large');
      return;
    }

    sending = true;
    outcome = null;
    announce(copy['place.photos.sending']);
    const result = await uploadPlacePhoto(placeId, file);
    sending = false;

    if (result.status === 'submitted') {
      confirmed = true;
      announce(copy['place.photos.sent']);
      // Width, height and the signed URL belong to the server's copy of the file; the strip fills
      // them in from its own refresh. This is the tile appearing the moment the photo is accepted.
      onSubmitted({
        mediaId: result.mediaId,
        url: null,
        approvalState: result.approvalState,
        widthPx: 0,
        heightPx: 0,
        uploadedAt: new Date().toISOString()
      });
      return;
    }
    if (result.status === 'authentication_required') {
      requestAuthentication({ origin: 'contribution' });
      return;
    }
    fail(
      result.status === 'too_large'
        ? 'too_large'
        : result.status === 'rate_limited'
          ? 'rate_limited'
          : result.status === 'invalid'
            ? 'wrong_type'
            : 'failed'
    );
  }

  function fail(next: Exclude<typeof outcome, null>): void {
    outcome = next;
    // Two identical refusals in a row are two separate events. Without this the live region text
    // never changes and the second one is announced to nobody.
    attempt += 1;
  }

  $effect(() => {
    // `attempt` is read so a repeated identical message still counts as a change.
    void attempt;
    if (outcomeMessage) announce(outcomeMessage);
  });
</script>

<div class="photo-contribution" data-photo-contribution>
  <button
    class="start"
    type="button"
    disabled={sending}
    aria-label={copy['place.photos.addLabel'].replace('{name}', placeName)}
    onclick={choose}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
      />
      <circle cx="12" cy="13" r="3" />
    </svg>
    {sending ? copy['place.photos.sending'] : copy['place.photos.add']}
  </button>
  <input
    bind:this={picker}
    class="picker"
    type="file"
    accept={acceptedMemberPhotoTypes.join(',')}
    tabindex="-1"
    aria-hidden="true"
    data-photo-picker
    onchange={() => void send()}
  />
  {#if outcomeMessage}
    <p class="outcome" data-photo-outcome>{outcomeMessage}</p>
  {:else if confirmed}
    <!-- The live region already told a screen reader; this is the same sentence for eyes, so a
         successful send is not answered by silence next to the button that did it. -->
    <p class="confirmation" data-photo-confirmation>{copy['place.photos.sent']}</p>
  {/if}
</div>

<style>
  .photo-contribution {
    display: grid;
    justify-items: start;
    gap: 0.25rem;
  }

  /* A photo is an additive gift, not a defect report, so its trigger is a real button in the
     card's pill family rather than the corrections' quiet underlined link. */
  .start {
    display: inline-flex;
    min-height: 2.1rem;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.85rem;
    border: 1px solid var(--hv-color-fjord);
    border-radius: 999px;
    background: transparent;
    color: var(--hv-color-fjord);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 800;
    cursor: pointer;
    transition: transform var(--hv-motion-instant) var(--hv-ease-settle);
  }

  .start:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .start:active:not(:disabled) {
    transform: scale(0.96);
  }

  .start svg {
    width: 1rem;
    height: 1rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .start:disabled {
    border-color: var(--hv-border-subtle);
    color: var(--hv-color-basalt-muted);
    cursor: progress;
  }

  .start:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 2px;
  }

  /* Kept in the document rather than hidden with `display: none`, because a file input has to be
     clickable from script; it is out of the tab order and out of the accessibility tree, and the
     button above is the whole control as far as a keyboard or screen reader is concerned. */
  .picker {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    border: 0;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Every outcome here is a refusal, and a refusal in the muted ink reads as a caption. It
     wears the danger ink the notices use instead. */
  .outcome {
    margin: 0;
    color: var(--hv-color-danger);
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.35;
  }

  .confirmation {
    margin: 0;
    color: var(--hv-color-basalt);
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.35;
  }
</style>
