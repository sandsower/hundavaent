<script lang="ts">
  import { resolve } from '$app/paths';

  import type { Catalogue, Locale } from '$i18n';

  interface Props {
    lang: Locale;
    copy: Catalogue;
    title: string;
    body: string;
  }

  let { lang, copy, title, body }: Props = $props();
</script>

<main class="stub-shell">
  <section class="stub-card">
    <p class="eyebrow">{copy['site.name']}</p>
    <h1>{title}</h1>
    <p>{body}</p>
    <a href={resolve('/[lang=lang]', { lang })}>{copy['nav.discover']}</a>
  </section>
</main>

<style>
  .stub-shell {
    display: grid;
    min-height: calc(100vh - 6rem);
    padding: 2rem 1rem;
    place-items: start center;
  }

  .stub-card {
    width: min(100%, 42rem);
    padding: clamp(1.5rem, 5vw, 3rem);
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    background: var(--paper-light);
    box-shadow: 0.55rem 0.55rem 0 var(--amber);
  }

  .eyebrow {
    margin: 0 0 0.5rem;
    color: var(--coral-dark);
    font-size: 0.8rem;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 8vw, 4.5rem);
    line-height: 0.95;
    letter-spacing: -0.05em;
  }

  p:not(.eyebrow) {
    margin: 1rem 0 1.5rem;
    line-height: 1.55;
  }

  a {
    display: inline-flex;
    padding: 0.7rem 1rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    font-weight: 850;
    text-decoration: none;
    box-shadow: 0 0.18rem 0 var(--ink);
  }
</style>
