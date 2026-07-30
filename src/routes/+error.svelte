<script lang="ts">
  import '../app.css';

  import { Button } from '@hundavaent/design-system';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import PawMark from '$lib/member-activity/PawMark.svelte';

  // This boundary sits above the locale layout, so no catalogue is loaded;
  // the copy stays bilingual and minimal.
  let notFound = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{page.status} | Hundavænt</title>
</svelte:head>

<main data-ui-mode="place">
  <section aria-labelledby="error-title">
    <span class="brand-paw" aria-hidden="true"><PawMark active={true} /></span>
    <p class="status">{page.status}</p>
    <h1 id="error-title">{notFound ? 'Síðan fannst ekki' : 'Eitthvað fór úrskeiðis'}</h1>
    <p>{notFound ? 'Page not found.' : 'Something went wrong.'}</p>
    <Button href={resolve('/[lang=lang]', { lang: 'is' })} intent="committed" class="error-action">
      Hundavænt
    </Button>
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

  h1 {
    margin: 0.4rem 0 1rem;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: clamp(2.6rem, 8vw, 5.4rem);
    font-weight: 650;
    line-height: 0.95;
    letter-spacing: -0.035em;
  }

  /* Button renders its own <a> in a separate component and owns the border/radius/background/
     color/font-weight/focus this hand-rolled control recipe used to carry (all of it matches
     Button's committed intent exactly - bg-signal, border-border-strong which resolves to
     basalt, text-basalt - not neutral, which would render a snow-raised background instead). The
     hook is ancestor-scoped under section, never a bare :global(), and keeps only the one thing
     Button doesn't own: this call site's layout margin. */
  section :global(.error-action) {
    margin-top: 1rem;
  }
</style>
