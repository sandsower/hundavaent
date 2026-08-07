<script lang="ts">
  import { Button } from '@hundavaent/design-system';
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

<main
  class="grid [place-items:start_center] min-h-[calc(100vh_-_var(--hv-app-header-height))] py-[clamp(2rem,8vh,5rem)] px-4 bg-snow"
  data-ui-mode="place"
>
  <section
    class="w-[min(100%,var(--hv-content-narrow))] p-[clamp(1.5rem,5vw,3rem)] border border-border-subtle rounded-panel bg-snow-raised shadow-raised"
    aria-labelledby="error-title"
  >
    <span
      class="brand-paw block w-[clamp(3.25rem,9vw,4.5rem)] mb-[0.9rem] text-brand-paw transform-[rotate(-10deg)]"
      aria-hidden="true"><PawMark active={true} /></span
    >
    <p class="status m-0 text-[1.1rem] font-black tracking-[0.12em] text-fjord">{page.status}</p>
    <h1
      id="error-title"
      class="mt-[0.4rem] mx-0 mb-4 font-display text-[clamp(2.6rem,8vw,5.4rem)] font-[650] leading-[0.95] tracking-[-0.035em] text-basalt"
    >
      {notFound ? data.copy['error.notFoundTitle'] : data.copy['error.unexpectedTitle']}
    </h1>
    <p>{notFound ? data.copy['error.notFoundBody'] : data.copy['error.unexpectedBody']}</p>
    {#if requestId}
      <p
        class="reference [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace] text-[0.9rem] wrap-anywhere"
      >
        {data.copy['error.reference']}: {requestId}
      </p>
    {/if}
    <!-- Button renders its own <a> in a separate component and owns the border/radius/background/
         color/font-weight/focus this hand-rolled control recipe used to carry (all of it matches
         Button's committed intent exactly - bg-signal, border-border-strong which resolves to
         basalt, text-basalt - not neutral, which would render a snow-raised background instead).
         The call site keeps only the one thing Button doesn't own: this layout margin, and it
         rides Button's own class prop rather than an ancestor-scoped :global() hook. -->
    <Button
      href={resolve('/[lang=lang]', { lang: data.lang })}
      intent="committed"
      class="error-action mt-4"
    >
      {data.copy['place.backToDirectory']}
    </Button>
  </section>
</main>

<style>
  /* The brand paw lands large on the dead end: a friendly stamp, not an alarm. The words
     stay still; only the decoration settles in. */
  .brand-paw {
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
</style>
