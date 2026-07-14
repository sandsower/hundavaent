<script lang="ts">
  import { resolve } from '$app/paths';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.place.name} - Hundavænt</title>
</svelte:head>

<main data-ui-mode="place">
  <article class="hv-panel status-panel">
    <a class="hv-control back-link" href={resolve('/[lang=lang]', { lang: data.lang })}
      >{data.copy['placeStatus.back']}</a
    >
    <p class="hv-eyebrow">{data.copy['placeStatus.eyebrow']}</p>
    <h1>{data.place.name}</h1>
    <section class="hv-notice" data-tone="info">
      <h2>
        {data.place.publicStatus === 'inactive'
          ? data.copy['placeStatus.inactiveTitle']
          : data.copy['placeStatus.underReviewTitle']}
      </h2>
      <p>
        {data.place.publicStatus === 'inactive'
          ? data.copy['placeStatus.inactiveBody']
          : data.copy['placeStatus.underReviewBody']}
      </p>
    </section>
  </article>
</main>

<style>
  :global(body) {
    margin: 0;
    background: var(--hv-color-snow, #f2f5f1);
    color: var(--hv-color-basalt, #1e2d31);
    font-family: var(--font-sans);
  }

  :global(body::before) {
    display: none;
  }

  main {
    min-height: calc(100vh - 5rem);
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background: var(--hv-color-snow);
  }

  .status-panel {
    width: min(100%, 42rem);
    padding: clamp(1.5rem, 5vw, 3.5rem);
  }

  .back-link {
    min-height: auto;
    padding: 0.45rem 0.65rem;
    color: var(--hv-color-fjord);
    justify-self: start;
  }

  .hv-eyebrow {
    margin: 3rem 0 0.5rem;
  }

  h1 {
    margin: 0;
    font-family: var(--hv-font-display);
    font-size: clamp(2.5rem, 10vw, 5.5rem);
    font-weight: 650;
    line-height: 0.95;
  }

  section {
    margin-top: 2rem;
  }

  h2 {
    margin: 0 0 0.75rem;
    font-family: var(--hv-font-display);
    font-size: clamp(1.35rem, 4vw, 2rem);
    font-weight: 650;
  }

  section p {
    margin-bottom: 0;
    max-width: 52ch;
    font-size: 1.05rem;
    line-height: 1.6;
  }
</style>
