<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

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

<main>
  <p class="status">{page.status}</p>
  <h1>{notFound ? data.copy['error.notFoundTitle'] : data.copy['error.unexpectedTitle']}</h1>
  <p>{notFound ? data.copy['error.notFoundBody'] : data.copy['error.unexpectedBody']}</p>
  {#if requestId}
    <p class="reference">{data.copy['error.reference']}: {requestId}</p>
  {/if}
  <a href={resolve('/[lang=lang]', { lang: data.lang })}>{data.copy['place.backToDirectory']}</a>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f7f0df;
    color: #193b45;
    font-family: var(--font-sans);
  }

  main {
    width: min(100% - 2rem, 42rem);
    margin: 0 auto;
    padding: 12vh 0 4rem;
  }

  .status {
    margin: 0;
    color: #b5402b;
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
    font-size: clamp(2.6rem, 8vw, 5.4rem);
    line-height: 0.95;
  }

  a {
    display: inline-block;
    margin-top: 1rem;
    color: #8e2f22;
    font-weight: 850;
  }

  a:focus-visible {
    outline: 4px solid #f1a33b;
    outline-offset: 3px;
  }
</style>
