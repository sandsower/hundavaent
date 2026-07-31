<script lang="ts">
  import { Button, Dialog } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';
  import {
    createAchievementShareSvg,
    renderAchievementSharePng,
    type AchievementShareCard
  } from './share-card';

  interface Props {
    card: AchievementShareCard;
    copy: Catalogue;
  }

  let { card, copy }: Props = $props();
  let open = $state(false);
  let busy = $state(false);
  let feedback = $state('');

  // This dialog's head row holds the h2 next to a close button, so it owns the h2 itself and
  // points Dialog's labelledby path at it (Dialog.svelte's TitleProps comment).
  const titleId = $props.id();

  const preview = $derived(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createAchievementShareSvg(card))}`
  );
  // Still sent as the share sheet's text, but no longer shown or copyable on its own: the image
  // is the thing being shared, and the caption travels with it.
  const caption = $derived(`${card.name}\n${card.description}\n#Hundavaent`);

  function openDialog(): void {
    feedback = '';
    open = true;
  }

  async function share(): Promise<void> {
    busy = true;
    feedback = '';
    try {
      const file = await renderAchievementSharePng(card);
      if (
        typeof navigator.share === 'function' &&
        (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({ files: [file], text: caption });
        feedback = copy['achievements.share.shared'];
      } else {
        downloadFile(file);
        feedback = copy['achievements.share.downloaded'];
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      feedback = copy['achievements.share.error'];
    } finally {
      busy = false;
    }
  }

  async function download(): Promise<void> {
    busy = true;
    feedback = '';
    try {
      downloadFile(await renderAchievementSharePng(card));
      feedback = copy['achievements.share.downloaded'];
    } catch {
      feedback = copy['achievements.share.error'];
    } finally {
      busy = false;
    }
  }

  function downloadFile(file: File): void {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="share">
  <Button class="share-trigger" onclick={openDialog}>
    {copy['achievements.share.action']}
  </Button>

  <Dialog bind:open size="wide" unpadded labelledby={titleId} onclose={() => (feedback = '')}>
    <div class="dialog-body">
      <div class="dialog-head">
        <h2 id={titleId}>{copy['achievements.share.title']}</h2>
        <Button
          shape="round"
          class="share-close"
          aria-label={copy['achievements.share.close']}
          onclick={() => (open = false)}>×</Button
        >
      </div>

      <img class="preview" src={preview} alt={copy['achievements.share.previewAlt']} />

      <div class="actions">
        <Button intent="primary" disabled={busy} onclick={share}>
          {copy['achievements.share.share']}
        </Button>
        <Button disabled={busy} onclick={download}>
          {copy['achievements.share.download']}
        </Button>
      </div>

      {#if feedback}
        <p class="feedback" aria-live="polite">{feedback}</p>
      {/if}
    </div>
  </Dialog>
</div>

<style>
  /* Button renders its own <button> inside a child component, so this component's scoped CSS
     cannot reach it directly - reachable only through this ancestor anchor with the actual
     target selector wrapped in :global(), the same pattern FavouriteControl.svelte uses for
     .favourite-toggle. The trigger and close classes are guaranteed to land on Button's rendered
     element because we pass them through Button's class prop ourselves. The anchor is
     display: contents so it stays a selector-only wrapper: the pre-migration root was the bare
     trigger button itself, and a block box here would wrap the inline-flex Button in a line box,
     nudging the three grid-track call sites (celebration/tier-cell/continuation) a few pixels. */
  .share {
    display: contents;
  }

  .share :global(.share-trigger) {
    width: fit-content;
    min-height: 2rem;
    padding: 0.3rem 0.55rem;
    font-size: 0.76rem;
  }

  .dialog-body {
    display: grid;
    gap: 1rem;
    padding: clamp(1rem, 4vw, 1.5rem);
  }

  .dialog-head {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
  }

  h2,
  .feedback {
    margin: 0;
  }

  h2 {
    font-family: var(--hv-font-display);
    font-size: clamp(1.35rem, 4vw, 1.8rem);
  }

  .share :global(.share-close) {
    font-size: 1.5rem;
    line-height: 1;
  }

  .preview {
    display: block;
    width: 100%;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 0.85rem;
  }

  .feedback {
    color: var(--hv-color-basalt-muted);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
</style>
