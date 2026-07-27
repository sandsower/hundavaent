<script lang="ts">
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
  let dialog = $state<HTMLDialogElement>();
  let busy = $state(false);
  let feedback = $state('');

  const preview = $derived(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createAchievementShareSvg(card))}`
  );
  const caption = $derived(`${card.name}\n${card.description}\n#Hundavaent`);

  function open(): void {
    feedback = '';
    dialog?.showModal();
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

  async function copyCaption(): Promise<void> {
    try {
      await navigator.clipboard.writeText(caption);
      feedback = copy['achievements.share.copied'];
    } catch {
      feedback = copy['achievements.share.error'];
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

<button class="share-trigger hv-control" type="button" onclick={open}>
  {copy['achievements.share.action']}
</button>

<dialog class="share-dialog" bind:this={dialog} onclose={() => (feedback = '')}>
  <div class="dialog-body">
    <div class="dialog-head">
      <div>
        <p class="eyebrow">{copy['achievements.share.eyebrow']}</p>
        <h2>{copy['achievements.share.title']}</h2>
      </div>
      <button
        class="close hv-control"
        type="button"
        aria-label={copy['achievements.share.close']}
        onclick={() => dialog?.close()}>×</button
      >
    </div>

    <img class="preview" src={preview} alt={copy['achievements.share.previewAlt']} />
    <p class="privacy">{copy['achievements.share.privacy']}</p>

    <div class="actions">
      <button class="primary hv-control" type="button" disabled={busy} onclick={share}>
        {copy['achievements.share.share']}
      </button>
      <button class="hv-control" type="button" disabled={busy} onclick={download}>
        {copy['achievements.share.download']}
      </button>
      <button class="hv-control" type="button" disabled={busy} onclick={copyCaption}>
        {copy['achievements.share.copy']}
      </button>
    </div>

    {#if feedback}
      <p class="feedback" aria-live="polite">{feedback}</p>
    {/if}
  </div>
</dialog>

<style>
  .share-trigger {
    width: fit-content;
    min-height: 2rem;
    padding: 0.3rem 0.55rem;
    font-size: 0.76rem;
  }

  .share-dialog {
    width: min(42rem, calc(100vw - 2rem));
    border: 1px solid var(--hv-border-subtle);
    border-radius: 1.25rem;
    padding: 0;
    color: var(--hv-color-basalt);
    background: var(--hv-color-snow-raised);
    box-shadow: 0 1.5rem 4rem rgb(30 45 49 / 24%);
  }

  .share-dialog::backdrop {
    background: rgb(24 38 34 / 58%);
    backdrop-filter: blur(0.2rem);
  }

  .dialog-body {
    display: grid;
    gap: 1rem;
    padding: clamp(1rem, 4vw, 1.5rem);
  }

  .dialog-head {
    display: flex;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
  }

  .eyebrow,
  h2,
  .privacy,
  .feedback {
    margin: 0;
  }

  .eyebrow {
    color: var(--hv-color-moss);
    font-size: 0.74rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin-block-start: 0.2rem;
    font-family: var(--hv-font-display);
    font-size: clamp(1.35rem, 4vw, 1.8rem);
  }

  .close {
    width: 2.25rem;
    min-width: 2.25rem;
    padding: 0;
    font-size: 1.5rem;
    line-height: 1;
  }

  .preview {
    display: block;
    width: 100%;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 0.85rem;
  }

  .privacy,
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

  .primary {
    color: var(--hv-color-snow-raised);
    border-color: var(--hv-color-moss);
    background: var(--hv-color-moss);
  }
</style>
