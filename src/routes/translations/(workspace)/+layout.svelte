<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  import { provideTranslationSaveCoordinator } from '$lib/translations/save-coordinator';
  import { Notice } from '@hundavaent/design-system';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
  const saveCoordinator = provideTranslationSaveCoordinator();

  async function guardLink(event: MouseEvent, destination: string): Promise<void> {
    if (!saveCoordinator.hasBlocking) return;
    event.preventDefault();
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    if (await saveCoordinator.settle()) await goto(destination);
  }

  async function guardLock(event: SubmitEvent): Promise<void> {
    if (!saveCoordinator.hasBlocking) return;
    event.preventDefault();
    if (await saveCoordinator.settle()) (event.currentTarget as HTMLFormElement).requestSubmit();
  }

  $effect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!saveCoordinator.hasBlocking) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
</script>

<header
  class="workspace-navigation flex gap-3 items-center justify-between min-h-16 py-[0.65rem] px-[clamp(1rem,3vw,2rem)] border-b border-b-border-subtle bg-snow-raised max-narrow:flex-wrap"
  data-ui-mode="operations"
>
  <a
    class="brand font-display text-[1.2rem] font-bold no-underline text-basalt max-narrow:w-[calc(100%_-_4rem)]"
    href={resolve('/translations')}
    onclick={(event) => void guardLink(event, resolve('/translations'))}>Hundavænt translations</a
  >
  <nav
    class="flex gap-1 max-narrow:order-3 max-narrow:grid max-narrow:w-full max-narrow:grid-cols-3"
    aria-label="Translation workspace"
  >
    <a
      class="inline-flex items-center min-h-10 py-[0.45rem] px-[0.65rem] border border-transparent rounded-control bg-transparent [font-family:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-extrabold text-basalt max-narrow:justify-center"
      href={resolve('/translations')}
      onclick={(event) => void guardLink(event, resolve('/translations'))}>Editor</a
    >
    <a
      class="inline-flex items-center min-h-10 py-[0.45rem] px-[0.65rem] border border-transparent rounded-control bg-transparent [font-family:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-extrabold text-basalt aria-disabled:opacity-[0.55] max-narrow:justify-center"
      href={resolve('/translations/review')}
      aria-disabled={saveCoordinator.hasBlocking}
      onclick={(event) => void guardLink(event, resolve('/translations/review'))}>Review</a
    >
    <a
      class="inline-flex items-center min-h-10 py-[0.45rem] px-[0.65rem] border border-transparent rounded-control bg-transparent [font-family:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-extrabold text-basalt aria-disabled:opacity-[0.55] max-narrow:justify-center"
      href={resolve('/translations/history')}
      aria-disabled={saveCoordinator.hasBlocking}
      onclick={(event) => void guardLink(event, resolve('/translations/history'))}>History</a
    >
  </nav>
  <form method="POST" action={resolve('/translations/logout')} onsubmit={guardLock}>
    <button
      class="inline-flex items-center min-h-10 py-[0.45rem] px-[0.65rem] border border-border-strong rounded-control bg-transparent [font-family:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-extrabold text-basalt"
      type="submit">Lock</button
    >
  </form>
</header>

<!-- Notice forwards these layout utilities and the semantic workspace-save-warning hook to its
     rendered root, so the route owns the spacing and width without an unlayered global rule. -->
{#if saveCoordinator.problemCount > 0}
  <Notice
    as="p"
    tone="error"
    role="alert"
    class="workspace-save-warning my-3 mx-auto w-[min(calc(100%_-_2rem),78rem)]"
  >
    Resolve {saveCoordinator.problemCount} translation save problem{saveCoordinator.problemCount ===
    1
      ? ''
      : 's'} before leaving the editor.
  </Notice>
{:else if saveCoordinator.hasUnsettled}
  <Notice
    as="p"
    role="status"
    class="workspace-save-warning my-3 mx-auto w-[min(calc(100%_-_2rem),78rem)]"
    >Saving edits before navigation…</Notice
  >
{/if}

{@render children()}
