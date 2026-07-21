<script lang="ts">
  import { resolve } from '$app/paths';

  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<header class="workspace-navigation" data-ui-mode="operations">
  <a class="brand" href={resolve('/translations')}>Hundavænt translations</a>
  <nav aria-label="Translation workspace">
    <a href={resolve('/translations')}>Editor</a>
    <a href={resolve('/translations/review')}>Review</a>
    <a href={resolve('/translations/history')}>History</a>
  </nav>
  <form method="POST" action={resolve('/translations/logout')}>
    <button type="submit">Lock</button>
  </form>
</header>

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
