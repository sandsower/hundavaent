<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  import { provideTranslationSaveCoordinator } from '$lib/translations/save-coordinator';
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

<header class="workspace-navigation" data-ui-mode="operations">
  <a
    class="brand"
    href={resolve('/translations')}
    onclick={(event) => void guardLink(event, resolve('/translations'))}>Hundavænt translations</a
  >
  <nav aria-label="Translation workspace">
    <a
      href={resolve('/translations')}
      onclick={(event) => void guardLink(event, resolve('/translations'))}>Editor</a
    >
    <a
      href={resolve('/translations/review')}
      aria-disabled={saveCoordinator.hasBlocking}
      onclick={(event) => void guardLink(event, resolve('/translations/review'))}>Review</a
    >
    <a
      href={resolve('/translations/history')}
      aria-disabled={saveCoordinator.hasBlocking}
      onclick={(event) => void guardLink(event, resolve('/translations/history'))}>History</a
    >
  </nav>
  <form method="POST" action={resolve('/translations/logout')} onsubmit={guardLock}>
    <button type="submit">Lock</button>
  </form>
</header>

{#if saveCoordinator.problemCount > 0}
  <p class="workspace-save-warning hv-notice" data-tone="error" role="alert">
    Resolve {saveCoordinator.problemCount} translation save problem{saveCoordinator.problemCount ===
    1
      ? ''
      : 's'} before leaving the editor.
  </p>
{:else if saveCoordinator.hasUnsettled}
  <p class="workspace-save-warning hv-notice" role="status">Saving edits before navigation…</p>
{/if}

{@render children()}

<style>
  .workspace-navigation {
    display: flex;
    min-height: 4rem;
    padding: 0.65rem clamp(1rem, 3vw, 2rem);
    border-bottom: 1px solid var(--hv-border-subtle);
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    background: var(--hv-color-snow-raised);
  }

  .workspace-save-warning {
    margin: 0.75rem auto;
    width: min(calc(100% - 2rem), 78rem);
  }

  [aria-disabled='true'] {
    opacity: 0.55;
  }

  .brand {
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: 1.2rem;
    font-weight: 700;
    text-decoration: none;
  }

  nav {
    display: flex;
    gap: 0.25rem;
  }

  nav a,
  button {
    min-height: 2.5rem;
    display: inline-flex;
    padding: 0.45rem 0.65rem;
    border: 1px solid transparent;
    border-radius: var(--hv-radius-control);
    align-items: center;
    background: transparent;
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 800;
  }

  button {
    border-color: var(--hv-border-strong);
  }

  @media (max-width: 42rem) {
    .workspace-navigation {
      flex-wrap: wrap;
    }

    .brand {
      width: calc(100% - 4rem);
    }

    nav {
      order: 3;
      width: 100%;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
    }

    nav a {
      justify-content: center;
    }
  }
</style>
