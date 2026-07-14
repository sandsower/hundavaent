<script lang="ts">
  import { resolve } from '$app/paths';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.place.name} - Hundavænt</title>
</svelte:head>

<main>
  <article>
    <a href={resolve('/[lang=lang]', { lang: data.lang })}>{data.copy['placeStatus.back']}</a>
    <p class="eyebrow">{data.copy['placeStatus.eyebrow']}</p>
    <h1>{data.place.name}</h1>
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
  </article>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f7f0df;
    color: #193b45;
    font-family: var(--font-sans);
  }

  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
  }

  article {
    width: min(100%, 42rem);
    padding: clamp(1.5rem, 5vw, 3.5rem);
    background: #fffaf0;
    border: 2px solid #193b45;
    border-radius: 2rem;
    box-shadow: 0.5rem 0.5rem 0 #f5a623;
  }

  a {
    color: #193b45;
    font-weight: 800;
  }

  .eyebrow {
    margin: 3rem 0 0.5rem;
    color: #b9432f;
    font-size: 0.85rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.5rem, 10vw, 5.5rem);
    line-height: 0.95;
  }

  h2 {
    margin: 2rem 0 0.75rem;
    font-size: clamp(1.35rem, 4vw, 2rem);
  }

  p:last-child {
    max-width: 52ch;
    font-size: 1.05rem;
    line-height: 1.6;
  }
</style>
