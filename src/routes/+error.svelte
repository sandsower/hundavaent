<script lang="ts">
  import '../app.css';

  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  // This boundary sits above the locale layout, so no catalogue is loaded;
  // the copy stays bilingual and minimal.
  let notFound = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{page.status} | Hundavænt</title>
</svelte:head>

<main data-ui-mode="place">
  <section aria-labelledby="error-title">
    <p class="status">{page.status}</p>
    <h1 id="error-title">{notFound ? 'Síðan fannst ekki' : 'Eitthvað fór úrskeiðis'}</h1>
    <p>{notFound ? 'Page not found.' : 'Something went wrong.'}</p>
    <a href={resolve('/[lang=lang]', { lang: 'is' })}>Hundavænt</a>
  </section>
</main>

<style>
  main {
    display: grid;
    min-height: 100vh;
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

  .status {
    margin: 0;
    color: var(--hv-color-fjord);
    font-size: 1.1rem;
    font-weight: 900;
    letter-spacing: 0.12em;
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
    min-height: var(--hv-control-height);
    margin-top: 1rem;
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
