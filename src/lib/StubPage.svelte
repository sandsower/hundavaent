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

<main class="stub-shell" data-ui-mode="place">
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
    min-height: calc(100vh - var(--hv-app-header-height));
    padding: clamp(1.5rem, 4vw, 3rem) 1rem;
    place-items: start center;
    background: var(--hv-color-snow);
  }

  .stub-card {
    width: min(100%, 42rem);
    padding: clamp(1.5rem, 5vw, 3rem);
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-raised);
  }

  .eyebrow {
    margin: 0 0 0.5rem;
    color: var(--hv-color-fjord);
    font-size: 0.8rem;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: clamp(2.4rem, 8vw, 4.5rem);
    font-weight: 650;
    line-height: 0.95;
    letter-spacing: -0.035em;
  }

  p:not(.eyebrow) {
    margin: 1rem 0 1.5rem;
    line-height: 1.55;
  }

  a {
    display: inline-flex;
    padding: 0.7rem 1rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
    font-weight: 850;
    text-decoration: none;
  }
</style>
