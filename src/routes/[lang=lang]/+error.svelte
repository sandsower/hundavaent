<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import PawMark from '$lib/member-activity/PawMark.svelte';

  let data = $derived(page.data);
  let notFound = $derived(page.status === 404);
  let requestId = $derived(page.error?.requestId);
</script>

<svelte:head>
  <title>
    {notFound ? data.copy['error.notFoundTitle'] : data.copy['error.unexpectedTitle']} | {data.copy[
      'site.name'
    ]}
  </title>
</svelte:head>

<main data-ui-mode="place">
  <section aria-labelledby="error-title">
    <span class="brand-paw" aria-hidden="true"><PawMark active={true} /></span>
    <p class="status">{page.status}</p>
    <h1 id="error-title">
      {notFound ? data.copy['error.notFoundTitle'] : data.copy['error.unexpectedTitle']}
    </h1>
    <p>{notFound ? data.copy['error.notFoundBody'] : data.copy['error.unexpectedBody']}</p>
    {#if requestId}
      <p class="reference">{data.copy['error.reference']}: {requestId}</p>
    {/if}
    <a href={resolve('/[lang=lang]', { lang: data.lang })}>
      {data.copy['place.backToDirectory']}
    </a>
  </section>
</main>

<style>
  main {
    display: grid;
    min-height: calc(100vh - var(--hv-app-header-height));
    padding: clamp(2rem, 8vh, 5rem) 1rem;
    place-items: start center;
    background: var(--hv-color-snow);
  }

  section {
    width: min(100%, var(--hv-content-narrow));
    padding: clamp(1.5rem, 5vw, 3rem);
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-raised);
  }

  /* The brand paw lands large on the dead end: a friendly stamp, not an alarm. The words
     stay still; only the decoration settles in. */
  .brand-paw {
    display: block;
    width: clamp(3.25rem, 9vw, 4.5rem);
    margin-bottom: 0.9rem;
    color: var(--hv-color-brand-paw);
    transform: rotate(-10deg);
    animation: brand-paw-settles var(--hv-motion-celebrate) var(--hv-ease-overshoot) both;
  }

  @keyframes brand-paw-settles {
    from {
      transform: rotate(-10deg) scale(0.72);
    }

    to {
      transform: rotate(-10deg) scale(1);
    }
  }

  .status {
    margin: 0;
    color: var(--hv-color-fjord);
    font-size: 1.1rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  .reference {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  h1 {
    margin: 0.4rem 0 1rem;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: clamp(2.6rem, 8vw, 5.4rem);
    font-weight: 650;
    line-height: 0.95;
    letter-spacing: -0.035em;
  }

  a {
    display: inline-flex;
    margin-top: 1rem;
    min-height: var(--hv-control-height);
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    align-items: center;
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
    font-weight: 850;
    text-decoration: none;
  }
</style>
