<script lang="ts">
  import { resolve } from '$app/paths';

  import { Button, Eyebrow, PageShell, Panel } from '@hundavaent/design-system';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.copy['about.metaTitle']} | {data.copy['site.name']}</title>
  <meta name="description" content={data.copy['about.metaDescription']} />
</svelte:head>

<main
  class="about-page min-h-[calc(100vh_-_var(--hv-app-header-height))] bg-snow"
  data-ui-mode="place"
>
  <PageShell as="div" class="about-shell">
    <section
      class="hero grid grid-cols-[minmax(0,1.08fr)_minmax(19rem,0.72fr)] overflow-hidden min-h-[42rem] border border-border-subtle rounded-panel bg-snow-raised shadow-raised max-[48rem]:grid-cols-[1fr] max-[48rem]:min-h-0"
      aria-labelledby="about-title"
    >
      <div
        class="hero-copy flex flex-col justify-center p-[clamp(2rem,6vw,5rem)] max-[48rem]:px-[1.35rem] max-[48rem]:pt-8 max-[48rem]:pb-[2.4rem]"
      >
        <Eyebrow class="my-[1em]">{data.copy['about.heroEyebrow']}</Eyebrow>
        <h1
          id="about-title"
          class="max-w-[11ch] mt-4 mx-0 mb-0 font-display text-[clamp(3.4rem,7.5vw,6.7rem)] font-[650] leading-[0.91] tracking-[-0.045em] text-pretty text-basalt max-[48rem]:text-[clamp(3.15rem,15vw,5rem)]"
        >
          {data.copy['about.heroTitle']}
        </h1>
        <p
          class="lede max-w-[40rem] mt-6 mx-0 mb-0 text-[clamp(1.08rem,1.8vw,1.3rem)] leading-[1.6] text-pretty text-basalt-muted"
        >
          {data.copy['about.heroLede']}
        </p>
        <p class="hero-story max-w-[39rem] mt-5 mx-0 mb-0 leading-[1.72] text-pretty">
          {data.copy['about.heroStory']}
        </p>
        <div
          class="hero-actions flex flex-wrap items-center gap-actions mt-[1.8rem] max-[25rem]:grid"
        >
          <Button href={resolve('/[lang=lang]', { lang: data.lang })} intent="committed">
            {data.copy['about.browseAction']}
          </Button>
          <Button href="#what-hundavaent-offers" class="hero-secondary">
            {data.copy['about.offersAction']}
          </Button>
        </div>
      </div>

      <figure
        class="hero-photo relative min-h-[42rem] m-0 border-l border-l-border-subtle bg-fjord-soft max-[48rem]:min-h-[34rem] max-[48rem]:border-t max-[48rem]:border-t-border-subtle max-[48rem]:border-l-0"
      >
        <img
          class="block w-full h-full object-cover object-[50%_47%]"
          src="/about/vic-and-miles.jpg"
          alt={data.copy['about.photoAlt']}
          width="1066"
          height="1600"
          fetchpriority="high"
          decoding="async"
        />
        <figcaption
          class="absolute right-0 bottom-0 py-[0.55rem] px-[0.8rem] border-t border-t-border-subtle border-l border-l-border-subtle bg-[rgb(251_252_249_/_93%)] text-[0.82rem] font-extrabold text-basalt"
        >
          {data.copy['about.photoCaption']}
        </figcaption>
      </figure>
    </section>

    <section
      class="editorial-section grid grid-cols-[minmax(0,0.78fr)_minmax(20rem,1fr)] items-start gap-[clamp(2rem,7vw,6rem)] py-[clamp(4rem,9vw,7rem)] px-[clamp(0rem,4vw,3rem)] max-[48rem]:grid-cols-[minmax(0,1fr)] max-[48rem]:px-[0.35rem]"
    >
      <h2
        class="m-0 font-display text-[clamp(2.45rem,5vw,4.4rem)] font-[650] leading-[0.98] tracking-[-0.035em] text-pretty"
      >
        {data.copy['about.problemTitle']}
      </h2>
      <div class="prose max-w-[43rem]">
        <p class="m-0 text-[1.05rem] leading-[1.8] text-pretty">
          {data.copy['about.problemBodyOne']}
        </p>
        <p class="m-0 mt-[1.15rem] text-[1.05rem] leading-[1.8] text-pretty">
          {data.copy['about.problemBodyTwo']}
        </p>
      </div>
    </section>

    <!-- .history-panel now lives on Panel's root element - same re-anchor reasoning as .about-shell. -->
    <Panel
      as="section"
      class="history-panel p-[clamp(2rem,5vw,3.5rem)] max-[48rem]:px-[1.2rem] max-[48rem]:py-6"
      aria-labelledby="history-title"
    >
      <div
        class="section-heading grid grid-cols-[minmax(0,0.9fr)_minmax(18rem,0.7fr)] items-end gap-[clamp(1.5rem,6vw,5rem)] max-[48rem]:grid-cols-[minmax(0,1fr)]"
      >
        <div>
          <Eyebrow class="tight-eyebrow">{data.copy['about.historyEyebrow']}</Eyebrow>
          <h2
            id="history-title"
            class="m-0 font-display text-[clamp(2.45rem,5vw,4.4rem)] font-[650] leading-[0.98] tracking-[-0.035em] text-pretty"
          >
            {data.copy['about.historyTitle']}
          </h2>
        </div>
        <p class="m-0 leading-[1.7] text-pretty text-basalt-muted">
          {data.copy['about.historyIntro']}
        </p>
      </div>

      <div
        class="timeline grid grid-cols-3 mt-12 border-t border-t-border-subtle max-[48rem]:grid-cols-[1fr]"
      >
        <article class="min-w-0 pt-6 pr-6 pb-2 pl-0 max-[48rem]:px-0 max-[48rem]:py-5">
          <span
            class="date block mb-[0.65rem] text-[0.75rem] font-[850] tracking-[0.08em] uppercase text-fjord"
            >{data.copy['about.history1924Date']}</span
          >
          <h3 class="m-0 font-display text-[1.35rem] font-[650] leading-[1.16] text-pretty">
            {data.copy['about.history1924Title']}
          </h3>
          <p class="mt-[0.7rem] mx-0 mb-0 leading-[1.62] text-pretty text-basalt-muted">
            {data.copy['about.history1924Body']}
          </p>
        </article>
        <article
          class="min-w-0 pt-6 pr-6 pb-2 pl-6 border-l border-l-border-subtle max-[48rem]:px-0 max-[48rem]:py-5 max-[48rem]:border-t max-[48rem]:border-t-border-subtle max-[48rem]:border-l-0"
        >
          <span
            class="date block mb-[0.65rem] text-[0.75rem] font-[850] tracking-[0.08em] uppercase text-fjord"
            >{data.copy['about.history1984Date']}</span
          >
          <h3 class="m-0 font-display text-[1.35rem] font-[650] leading-[1.16] text-pretty">
            {data.copy['about.history1984Title']}
          </h3>
          <p class="mt-[0.7rem] mx-0 mb-0 leading-[1.62] text-pretty text-basalt-muted">
            {data.copy['about.history1984Body']}
          </p>
        </article>
        <article
          class="min-w-0 pt-6 pr-6 pb-2 pl-6 border-l border-l-border-subtle max-[48rem]:px-0 max-[48rem]:py-5 max-[48rem]:border-t max-[48rem]:border-t-border-subtle max-[48rem]:border-l-0"
        >
          <span
            class="date block mb-[0.65rem] text-[0.75rem] font-[850] tracking-[0.08em] uppercase text-fjord"
            >{data.copy['about.historyTodayDate']}</span
          >
          <h3 class="m-0 font-display text-[1.35rem] font-[650] leading-[1.16] text-pretty">
            {data.copy['about.historyTodayTitle']}
          </h3>
          <p class="mt-[0.7rem] mx-0 mb-0 leading-[1.62] text-pretty text-basalt-muted">
            {data.copy['about.historyTodayBody']}
          </p>
        </article>
      </div>
    </Panel>

    <section
      class="editorial-section offers-intro grid grid-cols-[minmax(0,0.78fr)_minmax(20rem,1fr)] items-start gap-[clamp(2rem,7vw,6rem)] py-[clamp(4rem,9vw,7rem)] px-[clamp(0rem,4vw,3rem)] max-[48rem]:grid-cols-[minmax(0,1fr)] max-[48rem]:px-[0.35rem]"
      id="what-hundavaent-offers"
      aria-labelledby="offers-title"
    >
      <div>
        <Eyebrow class="tight-eyebrow">{data.copy['about.offersEyebrow']}</Eyebrow>
        <h2
          id="offers-title"
          class="m-0 font-display text-[clamp(2.45rem,5vw,4.4rem)] font-[650] leading-[0.98] tracking-[-0.035em] text-pretty"
        >
          {data.copy['about.offersTitle']}
        </h2>
      </div>
      <div class="prose max-w-[43rem]">
        <p class="m-0 text-[1.05rem] leading-[1.8] text-pretty">{data.copy['about.offersIntro']}</p>
      </div>
    </section>

    <div
      class="offers grid grid-cols-2 overflow-hidden -mt-12 border border-border-subtle rounded-panel bg-snow-raised max-[48rem]:grid-cols-[1fr] max-[48rem]:-mt-10"
    >
      <article class="offer p-[1.65rem]">
        <span
          class="cue inline-flex mb-4 py-[0.28rem] px-[0.45rem] rounded-control bg-moss-soft text-[0.72rem] font-[850] tracking-[0.06em] uppercase text-basalt"
          >{data.copy['about.offerDiscoverCue']}</span
        >
        <h3 class="m-0 font-display text-[1.35rem] font-[650] leading-[1.16] text-pretty">
          {data.copy['about.offerDiscoverTitle']}
        </h3>
        <p class="mt-[0.7rem] mx-0 mb-0 leading-[1.62] text-pretty text-basalt-muted">
          {data.copy['about.offerDiscoverBody']}
        </p>
      </article>
      <article
        class="offer p-[1.65rem] border-l border-l-border-subtle max-[48rem]:border-t max-[48rem]:border-t-border-subtle max-[48rem]:border-l-0"
      >
        <span
          class="cue inline-flex mb-4 py-[0.28rem] px-[0.45rem] rounded-control bg-moss-soft text-[0.72rem] font-[850] tracking-[0.06em] uppercase text-basalt"
          >{data.copy['about.offerAccessCue']}</span
        >
        <h3 class="m-0 font-display text-[1.35rem] font-[650] leading-[1.16] text-pretty">
          {data.copy['about.offerAccessTitle']}
        </h3>
        <p class="mt-[0.7rem] mx-0 mb-0 leading-[1.62] text-pretty text-basalt-muted">
          {data.copy['about.offerAccessBody']}
        </p>
      </article>
      <article class="offer p-[1.65rem] border-t border-t-border-subtle">
        <span
          class="cue inline-flex mb-4 py-[0.28rem] px-[0.45rem] rounded-control bg-moss-soft text-[0.72rem] font-[850] tracking-[0.06em] uppercase text-basalt"
          >{data.copy['about.offerRememberCue']}</span
        >
        <h3 class="m-0 font-display text-[1.35rem] font-[650] leading-[1.16] text-pretty">
          {data.copy['about.offerRememberTitle']}
        </h3>
        <p class="mt-[0.7rem] mx-0 mb-0 leading-[1.62] text-pretty text-basalt-muted">
          {data.copy['about.offerRememberBody']}
        </p>
      </article>
      <article
        class="offer p-[1.65rem] border-t border-t-border-subtle border-l border-l-border-subtle max-[48rem]:border-l-0"
      >
        <span
          class="cue inline-flex mb-4 py-[0.28rem] px-[0.45rem] rounded-control bg-moss-soft text-[0.72rem] font-[850] tracking-[0.06em] uppercase text-basalt"
          >{data.copy['about.offerContributeCue']}</span
        >
        <h3 class="m-0 font-display text-[1.35rem] font-[650] leading-[1.16] text-pretty">
          {data.copy['about.offerContributeTitle']}
        </h3>
        <p class="mt-[0.7rem] mx-0 mb-0 leading-[1.62] text-pretty text-basalt-muted">
          {data.copy['about.offerContributeBody']}
        </p>
      </article>
    </div>

    <!-- Full-bleed: cancel exactly the inset the page shell holds it in by, and pay it back as
         padding. Naming the shell's own token is what keeps the two in step - a literal copy of it
         here silently became a 4px horizontal overflow the moment the shell moved to the shared
         edge inset. -->
    <section
      class="trust-section grid grid-cols-[minmax(0,0.9fr)_minmax(19rem,0.8fr)] gap-[clamp(2rem,7vw,6rem)] mt-[clamp(4rem,9vw,7rem)] p-[clamp(2rem,5vw,3.5rem)] border-y border-y-border-subtle bg-moss-soft max-[48rem]:grid-cols-[minmax(0,1fr)] max-[48rem]:mx-[calc(var(--hv-space-edge)_*_-1)] max-[48rem]:px-[var(--hv-space-edge)]"
      aria-labelledby="trust-title"
    >
      <div class="trust-intro">
        <Eyebrow class="tight-eyebrow">{data.copy['about.trustEyebrow']}</Eyebrow>
        <h2
          id="trust-title"
          class="m-0 font-display text-[clamp(2.45rem,5vw,4.4rem)] font-[650] leading-[0.98] tracking-[-0.035em] text-pretty"
        >
          {data.copy['about.trustTitle']}
        </h2>
        <p class="max-w-[39rem] mt-5 mx-0 mb-0 leading-[1.75] text-pretty">
          {data.copy['about.trustIntro']}
        </p>
      </div>
      <div class="trust-cards grid gap-4">
        <article
          class="trust-card p-[1.4rem] border border-border-subtle rounded-panel bg-snow-raised"
        >
          <p
            class="trust-subtitle m-0 mb-[0.35rem] text-[0.72rem] font-[850] tracking-[0.08em] uppercase text-pretty text-fjord"
          >
            {data.copy['about.accessSubtitle']}
          </p>
          <h3 class="m-0 font-display text-[1.35rem] font-[650] leading-[1.16] text-pretty">
            {data.copy['about.accessTitle']}
          </h3>
          <p class="mt-[0.7rem] mx-0 mb-0 leading-[1.62] text-pretty text-basalt-muted">
            {data.copy['about.accessBody']}
          </p>
        </article>
        <article
          class="trust-card p-[1.4rem] border border-border-subtle rounded-panel bg-snow-raised"
        >
          <p
            class="trust-subtitle m-0 mb-[0.35rem] text-[0.72rem] font-[850] tracking-[0.08em] uppercase text-pretty text-fjord"
          >
            {data.copy['about.friendlinessSubtitle']}
          </p>
          <h3 class="m-0 font-display text-[1.35rem] font-[650] leading-[1.16] text-pretty">
            {data.copy['about.friendlinessTitle']}
          </h3>
          <p class="mt-[0.7rem] mx-0 mb-0 leading-[1.62] text-pretty text-basalt-muted">
            {data.copy['about.friendlinessBody']}
          </p>
        </article>
      </div>
    </section>

    <section
      class="vision grid grid-cols-[minmax(0,1fr)_auto] items-end gap-8 mt-[clamp(4rem,9vw,7rem)] p-[clamp(2rem,5vw,4rem)] border border-basalt rounded-panel bg-basalt text-snow-raised max-[48rem]:grid-cols-[minmax(0,1fr)]"
      aria-labelledby="vision-title"
    >
      <div class="max-[48rem]:min-w-0">
        <Eyebrow class="tight-eyebrow">{data.copy['about.visionEyebrow']}</Eyebrow>
        <h2
          id="vision-title"
          class="m-0 font-display text-[clamp(2.45rem,5vw,4.4rem)] font-[650] leading-[0.98] tracking-[-0.035em] text-pretty max-[48rem]:break-words"
        >
          {data.copy['about.visionTitle']}
        </h2>
        <!-- :not(.hv-eyebrow) is vacuous now: the eyebrow is a component-rendered <p> that no longer
             carries this file's scope hash, so scoped `.vision p` cannot match it regardless - the two
             locally-authored body paragraphs are the only <p> elements left in .vision. -->
        <p class="max-w-[44rem] mt-5 mx-0 mb-0 leading-[1.72] text-pretty text-[#dbe2df]">
          {data.copy['about.visionBodyOne']}
        </p>
        <p class="max-w-[44rem] mt-5 mx-0 mb-0 leading-[1.72] text-pretty text-[#dbe2df]">
          {data.copy['about.visionBodyTwo']}
        </p>
      </div>
      <div class="vision-actions grid min-w-[12rem] gap-[0.7rem] max-[48rem]:min-w-0">
        <Button href={resolve('/[lang=lang]', { lang: data.lang })} intent="committed">
          {data.copy['about.browseAction']}
        </Button>
        <!-- Grandfathered deliberate tone override: a one-off hero flourish (a ghost button - no
             fill, snow-raised border and text - against the dark basalt vision panel), the same
             kind of exception AchievementShare's size overrides carry. Not a pattern to
             replicate elsewhere. -->
        <Button
          href={resolve('/[lang=lang]/suggest', { lang: data.lang })}
          class="vision-secondary"
        >
          {data.copy['about.suggestAction']}
        </Button>
      </div>
    </section>

    <footer
      class="sources flex items-baseline gap-x-8 gap-y-4 pt-8 text-[0.82rem] leading-[1.6] text-basalt-muted max-[48rem]:grid"
    >
      <h2 class="m-0 font-ui [font-size:inherit] font-[850] text-pretty text-basalt">
        {data.copy['about.sourcesTitle']}
      </h2>
      <ul class="flex flex-wrap m-0 p-0 gap-x-[1.4rem] gap-y-[0.35rem] list-none">
        <li>
          <a href="https://www.hundasamur.is/greinar1/hundahald-i-ettbyli">
            {data.copy['about.sourceHistory']}
          </a>
        </li>
        <li>
          <a href="https://www.straeto.is/notendaupplysingar/gaeludyr-i-straeto">
            {data.copy['about.sourceBus']}
          </a>
        </li>
        <li>
          <a href="https://www.kringlan.is/frettir/smahundar-a-sunnudogum">
            {data.copy['about.sourceMall']}
          </a>
        </li>
      </ul>
    </footer>
  </PageShell>
</main>

<style>
  /* .about-shell now lives on PageShell's own root element, outside this file's scope hash.
     Anchored under the locally-authored .about-page (which keeps its hash) rather than fully
     global: PageShell's own scoped .shell rule computes to two classes of specificity, and a
     bare :global(.about-shell) at one class silently loses this padding-top override to the
     component's padding-block. The hashed ancestor lifts this to three classes and wins. */
  .about-page :global(.about-shell) {
    padding-top: clamp(1.5rem, 4vw, 3.5rem);
  }

  /* Button renders its own <a> in a separate component, and data-intent is fully retired, so the
     old attribute-presence selector (":not([data-intent])" picking out the neutral CTA) is
     re-anchored as an explicit hook class instead - ancestor-scoped under .hero-actions, never a
     bare :global(). Documented call-site flourish: Button's own neutral intent already resolves
     border-border-strong to basalt (--hv-border-strong IS --hv-color-basalt), so this is
     currently a no-op restating the default rather than a visible override - kept anyway to
     preserve the original rule's intent 1:1 rather than silently dropping it. */
  .hero-actions :global(.hero-secondary) {
    border-color: var(--hv-color-basalt);
  }

  /* Eyebrow's own base classes now own the zero margin (m-0); this override wins over that
     layered utility because unlayered scoped CSS always beats a layered one regardless of
     specificity. The ancestor classes (.section-heading, .offers-intro, .trust-intro, .vision)
     stay locally-authored plain divs, so they keep this file's scope hash and the compound
     `:global(.tight-eyebrow)` form reaches the component-rendered <p> correctly. */
  .section-heading :global(.tight-eyebrow),
  .offers-intro :global(.tight-eyebrow),
  .trust-intro :global(.tight-eyebrow),
  .vision :global(.tight-eyebrow) {
    margin: 0 0 0.65rem;
  }

  .vision :global(.tight-eyebrow) {
    color: #9cc4d3;
  }

  /* Button renders its own <a> in a separate component; the hook is ancestor-scoped under
     .vision-actions, never a bare :global(). See the grandfathered-override comment at the call
     site above. */
  .vision-actions :global(.vision-secondary) {
    border-color: var(--hv-color-snow-raised);
    background: transparent;
    color: var(--hv-color-snow-raised);
  }
</style>
