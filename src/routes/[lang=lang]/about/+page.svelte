<script lang="ts">
  import { resolve } from '$app/paths';

  import { Eyebrow, PageShell, Panel } from '@hundavaent/design-system';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.copy['about.metaTitle']} | {data.copy['site.name']}</title>
  <meta name="description" content={data.copy['about.metaDescription']} />
</svelte:head>

<main class="about-page" data-ui-mode="place">
  <PageShell as="div" class="about-shell">
    <section class="hero" aria-labelledby="about-title">
      <div class="hero-copy">
        <Eyebrow>{data.copy['about.heroEyebrow']}</Eyebrow>
        <h1 id="about-title">{data.copy['about.heroTitle']}</h1>
        <p class="lede">{data.copy['about.heroLede']}</p>
        <p class="hero-story">{data.copy['about.heroStory']}</p>
        <div class="hero-actions flex flex-wrap items-center gap-actions">
          <a
            class="hv-control"
            data-intent="committed"
            href={resolve('/[lang=lang]', { lang: data.lang })}
          >
            {data.copy['about.browseAction']}
          </a>
          <a class="hv-control" href="#what-hundavaent-offers">
            {data.copy['about.offersAction']}
          </a>
        </div>
      </div>

      <figure class="hero-photo">
        <img
          src="/about/vic-and-miles.jpg"
          alt={data.copy['about.photoAlt']}
          width="1066"
          height="1600"
          fetchpriority="high"
          decoding="async"
        />
        <figcaption>{data.copy['about.photoCaption']}</figcaption>
      </figure>
    </section>

    <section class="editorial-section">
      <h2>{data.copy['about.problemTitle']}</h2>
      <div class="prose">
        <p>{data.copy['about.problemBodyOne']}</p>
        <p>{data.copy['about.problemBodyTwo']}</p>
      </div>
    </section>

    <Panel as="section" class="history-panel" aria-labelledby="history-title">
      <div class="section-heading">
        <div>
          <Eyebrow class="tight-eyebrow">{data.copy['about.historyEyebrow']}</Eyebrow>
          <h2 id="history-title">{data.copy['about.historyTitle']}</h2>
        </div>
        <p>{data.copy['about.historyIntro']}</p>
      </div>

      <div class="timeline">
        <article>
          <span class="date">{data.copy['about.history1924Date']}</span>
          <h3>{data.copy['about.history1924Title']}</h3>
          <p>{data.copy['about.history1924Body']}</p>
        </article>
        <article>
          <span class="date">{data.copy['about.history1984Date']}</span>
          <h3>{data.copy['about.history1984Title']}</h3>
          <p>{data.copy['about.history1984Body']}</p>
        </article>
        <article>
          <span class="date">{data.copy['about.historyTodayDate']}</span>
          <h3>{data.copy['about.historyTodayTitle']}</h3>
          <p>{data.copy['about.historyTodayBody']}</p>
        </article>
      </div>
    </Panel>

    <section
      class="editorial-section offers-intro"
      id="what-hundavaent-offers"
      aria-labelledby="offers-title"
    >
      <div>
        <Eyebrow class="tight-eyebrow">{data.copy['about.offersEyebrow']}</Eyebrow>
        <h2 id="offers-title">{data.copy['about.offersTitle']}</h2>
      </div>
      <div class="prose">
        <p>{data.copy['about.offersIntro']}</p>
      </div>
    </section>

    <div class="offers">
      <article class="offer">
        <span class="cue">{data.copy['about.offerDiscoverCue']}</span>
        <h3>{data.copy['about.offerDiscoverTitle']}</h3>
        <p>{data.copy['about.offerDiscoverBody']}</p>
      </article>
      <article class="offer">
        <span class="cue">{data.copy['about.offerAccessCue']}</span>
        <h3>{data.copy['about.offerAccessTitle']}</h3>
        <p>{data.copy['about.offerAccessBody']}</p>
      </article>
      <article class="offer">
        <span class="cue">{data.copy['about.offerRememberCue']}</span>
        <h3>{data.copy['about.offerRememberTitle']}</h3>
        <p>{data.copy['about.offerRememberBody']}</p>
      </article>
      <article class="offer">
        <span class="cue">{data.copy['about.offerContributeCue']}</span>
        <h3>{data.copy['about.offerContributeTitle']}</h3>
        <p>{data.copy['about.offerContributeBody']}</p>
      </article>
    </div>

    <section class="trust-section" aria-labelledby="trust-title">
      <div class="trust-intro">
        <Eyebrow class="tight-eyebrow">{data.copy['about.trustEyebrow']}</Eyebrow>
        <h2 id="trust-title">{data.copy['about.trustTitle']}</h2>
        <p>{data.copy['about.trustIntro']}</p>
      </div>
      <div class="trust-cards">
        <article class="trust-card">
          <p class="trust-subtitle">{data.copy['about.accessSubtitle']}</p>
          <h3>{data.copy['about.accessTitle']}</h3>
          <p>{data.copy['about.accessBody']}</p>
        </article>
        <article class="trust-card">
          <p class="trust-subtitle">{data.copy['about.friendlinessSubtitle']}</p>
          <h3>{data.copy['about.friendlinessTitle']}</h3>
          <p>{data.copy['about.friendlinessBody']}</p>
        </article>
      </div>
    </section>

    <section class="vision" aria-labelledby="vision-title">
      <div>
        <Eyebrow class="tight-eyebrow">{data.copy['about.visionEyebrow']}</Eyebrow>
        <h2 id="vision-title">{data.copy['about.visionTitle']}</h2>
        <p>{data.copy['about.visionBodyOne']}</p>
        <p>{data.copy['about.visionBodyTwo']}</p>
      </div>
      <div class="vision-actions">
        <a
          class="hv-control"
          data-intent="committed"
          href={resolve('/[lang=lang]', { lang: data.lang })}
        >
          {data.copy['about.browseAction']}
        </a>
        <a
          class="hv-control vision-secondary"
          href={resolve('/[lang=lang]/suggest', { lang: data.lang })}
        >
          {data.copy['about.suggestAction']}
        </a>
      </div>
    </section>

    <footer class="sources">
      <h2>{data.copy['about.sourcesTitle']}</h2>
      <ul>
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
  .about-page {
    min-height: calc(100vh - var(--hv-app-header-height));
    background: var(--hv-color-snow);
  }

  /* .about-shell now lives on PageShell's own root element, outside this file's scope hash -
     the class is unique to this page (grep-verified), so a fully-global anchor is safe. */
  :global(.about-shell) {
    padding-top: clamp(1.5rem, 4vw, 3.5rem);
  }

  h1,
  h2,
  h3,
  p {
    text-wrap: pretty;
  }

  h1,
  h2,
  h3 {
    font-family: var(--hv-font-display);
    font-weight: 650;
  }

  .hero {
    display: grid;
    min-height: 42rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    grid-template-columns: minmax(0, 1.08fr) minmax(19rem, 0.72fr);
    overflow: hidden;
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-raised);
  }

  .hero-copy {
    display: flex;
    padding: clamp(2rem, 6vw, 5rem);
    flex-direction: column;
    justify-content: center;
  }

  h1 {
    max-width: 11ch;
    margin: 1rem 0 0;
    color: var(--hv-color-basalt);
    font-size: clamp(3.4rem, 7.5vw, 6.7rem);
    line-height: 0.91;
    letter-spacing: -0.045em;
  }

  .lede {
    max-width: 40rem;
    margin: 1.5rem 0 0;
    color: var(--hv-color-basalt-muted);
    font-size: clamp(1.08rem, 1.8vw, 1.3rem);
    line-height: 1.6;
  }

  .hero-story {
    max-width: 39rem;
    margin: 1.25rem 0 0;
    line-height: 1.72;
  }

  .hero-actions {
    margin-top: 1.8rem;
  }

  .hero-actions .hv-control:not([data-intent]) {
    border-color: var(--hv-color-basalt);
  }

  .hero-photo {
    position: relative;
    min-height: 42rem;
    margin: 0;
    border-left: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-fjord-soft);
  }

  .hero-photo img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 47%;
  }

  .hero-photo figcaption {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 0.55rem 0.8rem;
    border-top: 1px solid var(--hv-border-subtle);
    border-left: 1px solid var(--hv-border-subtle);
    background: rgb(251 252 249 / 93%);
    color: var(--hv-color-basalt);
    font-size: 0.82rem;
    font-weight: 800;
  }

  .editorial-section {
    display: grid;
    padding: clamp(4rem, 9vw, 7rem) clamp(0rem, 4vw, 3rem);
    grid-template-columns: minmax(0, 0.78fr) minmax(20rem, 1fr);
    gap: clamp(2rem, 7vw, 6rem);
    align-items: start;
  }

  .editorial-section h2,
  .section-heading h2,
  .trust-intro h2,
  .vision h2 {
    margin: 0;
    font-size: clamp(2.45rem, 5vw, 4.4rem);
    line-height: 0.98;
    letter-spacing: -0.035em;
  }

  .prose {
    max-width: 43rem;
  }

  .prose p {
    margin: 0;
    font-size: 1.05rem;
    line-height: 1.8;
  }

  .prose p + p {
    margin-top: 1.15rem;
  }

  /* .history-panel now lives on Panel's root element - same re-anchor reasoning as .about-shell. */
  :global(.history-panel) {
    padding: clamp(2rem, 5vw, 3.5rem);
  }

  .section-heading {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(18rem, 0.7fr);
    gap: clamp(1.5rem, 6vw, 5rem);
    align-items: end;
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

  .section-heading > p {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    line-height: 1.7;
  }

  .timeline {
    display: grid;
    margin-top: 3rem;
    border-top: 1px solid var(--hv-border-subtle);
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .timeline article {
    min-width: 0;
    padding: 1.5rem 1.5rem 0.5rem 0;
  }

  .timeline article + article {
    padding-left: 1.5rem;
    border-left: 1px solid var(--hv-border-subtle);
  }

  .date {
    display: block;
    margin-bottom: 0.65rem;
    color: var(--hv-color-fjord);
    font-size: 0.75rem;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .timeline h3,
  .offer h3,
  .trust-card h3 {
    margin: 0;
    font-size: 1.35rem;
    line-height: 1.16;
  }

  .timeline p,
  .offer > p,
  .trust-card > p:last-child {
    margin: 0.7rem 0 0;
    color: var(--hv-color-basalt-muted);
    line-height: 1.62;
  }

  .offers {
    display: grid;
    margin-top: -3rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow: hidden;
    background: var(--hv-color-snow-raised);
  }

  .offer {
    padding: 1.65rem;
  }

  .offer:nth-child(even) {
    border-left: 1px solid var(--hv-border-subtle);
  }

  .offer:nth-child(n + 3) {
    border-top: 1px solid var(--hv-border-subtle);
  }

  .cue {
    display: inline-flex;
    margin-bottom: 1rem;
    padding: 0.28rem 0.45rem;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-moss-soft);
    color: var(--hv-color-basalt);
    font-size: 0.72rem;
    font-weight: 850;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .trust-section {
    display: grid;
    margin-top: clamp(4rem, 9vw, 7rem);
    padding: clamp(2rem, 5vw, 3.5rem);
    border-block: 1px solid var(--hv-border-subtle);
    grid-template-columns: minmax(0, 0.9fr) minmax(19rem, 0.8fr);
    gap: clamp(2rem, 7vw, 6rem);
    background: var(--hv-color-moss-soft);
  }

  .trust-intro > p:last-child {
    max-width: 39rem;
    margin: 1.25rem 0 0;
    line-height: 1.75;
  }

  .trust-cards {
    display: grid;
    gap: 1rem;
  }

  .trust-card {
    padding: 1.4rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
  }

  .trust-subtitle {
    margin: 0 0 0.35rem;
    color: var(--hv-color-fjord);
    font-size: 0.72rem;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .vision {
    display: grid;
    margin-top: clamp(4rem, 9vw, 7rem);
    padding: clamp(2rem, 5vw, 4rem);
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-panel);
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2rem;
    align-items: end;
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
  }

  .vision :global(.tight-eyebrow) {
    color: #9cc4d3;
  }

  /* :not(.hv-eyebrow) is vacuous now: the eyebrow is a component-rendered <p> that no longer
     carries this file's scope hash, so scoped `.vision p` cannot match it regardless - the two
     locally-authored body paragraphs are the only <p> elements left in .vision. */
  .vision p {
    max-width: 44rem;
    margin: 1.25rem 0 0;
    color: #dbe2df;
    line-height: 1.72;
  }

  .vision-actions {
    display: grid;
    min-width: 12rem;
    gap: 0.7rem;
  }

  .vision-secondary {
    border-color: var(--hv-color-snow-raised);
    background: transparent;
    color: var(--hv-color-snow-raised);
  }

  .sources {
    display: flex;
    padding-top: 2rem;
    gap: 1rem 2rem;
    align-items: baseline;
    color: var(--hv-color-basalt-muted);
    font-size: 0.82rem;
    line-height: 1.6;
  }

  .sources h2 {
    margin: 0;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-ui);
    font-size: inherit;
    font-weight: 850;
  }

  .sources ul {
    display: flex;
    margin: 0;
    padding: 0;
    gap: 0.35rem 1.4rem;
    flex-wrap: wrap;
    list-style: none;
  }

  @media (max-width: 48rem) {
    .hero {
      min-height: 0;
      grid-template-columns: 1fr;
    }

    .hero-copy {
      padding: 2rem 1.35rem 2.4rem;
    }

    h1 {
      font-size: clamp(3.15rem, 15vw, 5rem);
    }

    .hero-photo {
      min-height: 34rem;
      border-top: 1px solid var(--hv-border-subtle);
      border-left: 0;
    }

    .editorial-section,
    .section-heading,
    .trust-section,
    .vision {
      grid-template-columns: minmax(0, 1fr);
    }

    .vision > * {
      min-width: 0;
    }

    .vision h2 {
      overflow-wrap: break-word;
    }

    .editorial-section {
      padding-inline: 0.35rem;
    }

    :global(.history-panel) {
      padding: 1.5rem 1.2rem;
    }

    .timeline,
    .offers {
      grid-template-columns: 1fr;
    }

    .timeline article,
    .timeline article + article {
      padding: 1.25rem 0;
      border-left: 0;
    }

    .timeline article + article {
      border-top: 1px solid var(--hv-border-subtle);
    }

    .offers {
      margin-top: -2.5rem;
    }

    .offer:nth-child(even) {
      border-left: 0;
    }

    .offer + .offer {
      border-top: 1px solid var(--hv-border-subtle);
    }

    /* Full-bleed: cancel exactly the inset the page shell holds it in by, and pay it back as
       padding. Naming the shell's own token is what keeps the two in step - a literal copy of it
       here silently became a 4px horizontal overflow the moment the shell moved to the shared
       edge inset. */
    .trust-section {
      margin-inline: calc(var(--hv-space-edge) * -1);
      padding-inline: var(--hv-space-edge);
    }

    .vision-actions {
      min-width: 0;
    }

    .sources {
      display: grid;
    }
  }

  @media (max-width: 25rem) {
    .hero-actions {
      display: grid;
    }
  }
</style>
