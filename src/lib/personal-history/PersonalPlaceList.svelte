<script lang="ts">
  import { resolve } from '$app/paths';

  import type { Catalogue, Locale } from '$i18n';
  import type { PersonalPlace } from '$server/personal-history/personal-history';

  interface Props {
    places: PersonalPlace[];
    lang: Locale;
    copy: Catalogue;
    isFirstPage: boolean;
    nextCursor: { beforeActivityAt: string; beforePlaceId: string } | null;
    emptyTitleKey: keyof Catalogue;
    emptyBodyKey: keyof Catalogue;
    pageEmptyTitleKey: keyof Catalogue;
    pageEmptyBodyKey: keyof Catalogue;
    listLabelKey: keyof Catalogue;
    view: 'favourites' | 'visited';
  }

  let {
    places,
    lang,
    copy,
    isFirstPage,
    nextCursor,
    emptyTitleKey,
    emptyBodyKey,
    pageEmptyTitleKey,
    pageEmptyBodyKey,
    listLabelKey,
    view
  }: Props = $props();

  function availabilityLabel(place: PersonalPlace): string {
    if (place.availability === 'inactive') return copy['favourite.inactive'];
    if (place.availability === 'unavailable') return copy['favourite.unavailable'];
    return copy['favourite.available'];
  }

  function discoveryPlaceHref(placeId: string): string {
    const path = resolve('/[lang=lang]', { lang });
    const query = new URLSearchParams({ place: placeId });
    return `${path}?${query}`;
  }

  function nextPageHref(cursor: { beforeActivityAt: string; beforePlaceId: string }): string {
    const path = resolve('/[lang=lang]/history', { lang });
    const query = new URLSearchParams({
      view,
      before: cursor.beforeActivityAt,
      beforePlace: cursor.beforePlaceId
    });
    return `${path}?${query}`;
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat(lang === 'is' ? 'is-IS' : 'en-GB', {
      dateStyle: 'medium'
    }).format(new Date(value));
  }
</script>

{#if places.length === 0 && isFirstPage}
  <section class="empty" aria-labelledby="history-list-empty-title">
    <span aria-hidden="true">♡</span>
    <h2 id="history-list-empty-title" tabindex="-1">{copy[emptyTitleKey]}</h2>
    <p>{copy[emptyBodyKey]}</p>
    <a href={resolve('/[lang=lang]', { lang })}>{copy['favourite.backToDiscovery']}</a>
  </section>
{:else if places.length === 0}
  <section class="empty" aria-labelledby="history-list-page-empty-title">
    <span aria-hidden="true">♡</span>
    <h2 id="history-list-page-empty-title" tabindex="-1">{copy[pageEmptyTitleKey]}</h2>
    <p>{copy[pageEmptyBodyKey]}</p>
  </section>
{:else}
  <ul aria-label={copy[listLabelKey]}>
    {#each places as place (place.placeId)}
      <li data-history-row class:unavailable={place.availability !== 'available'}>
        <div>
          <h2>{place.name}</h2>
          <p>{place.locality}</p>
          <strong>{availabilityLabel(place)}</strong>
          {#if place.availability !== 'available'}
            <small>
              {place.availability === 'inactive'
                ? copy['favourite.inactiveHelp']
                : copy['favourite.unavailableHelp']}
            </small>
          {/if}
          {#if place.availability === 'inactive' && place.successorPlaceId && place.successorName}
            <p class="successor">
              {copy['history.successorNote'].replace('{name}', place.successorName)}
            </p>
          {/if}
          {#if place.visitCount}
            <p class="visit-meta">
              {(place.visitCount === 1
                ? copy['history.visitCountOne']
                : copy['history.visitCount'].replace('{count}', String(place.visitCount))) +
                (place.lastVisitedAt
                  ? ' · ' +
                    copy['history.lastVisited'].replace('{date}', formatDate(place.lastVisitedAt))
                  : '')}
            </p>
          {/if}
        </div>
        <div class="actions">
          {#if place.availability === 'available'}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={discoveryPlaceHref(place.placeId)}>{copy['directory.openPlace']}</a>
          {:else if place.successorPlaceId && place.successorAvailable}
            <!-- A successor is a Candidate at transition time and may not be published yet;
                 only a currently discoverable successor gets a discovery deep link. The name
                 itself is still shown honestly in the successor note above. -->
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={discoveryPlaceHref(place.successorPlaceId)}>
              {copy['history.successorLink'].replace('{name}', place.successorName ?? '')}
            </a>
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  {#if nextCursor}
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a class="next-page" href={nextPageHref(nextCursor)}>{copy['history.nextPage']}</a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {/if}
{/if}

<style>
  ul {
    display: grid;
    margin: 1.5rem 0;
    padding: 0;
    gap: 1rem;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 1rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    gap: 1rem;
    background: var(--paper-light);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--teal);
  }
  li.unavailable {
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--paper-deep);
  }
  h2,
  li p {
    margin: 0;
  }
  li strong,
  li small,
  li .visit-meta,
  li .successor {
    display: block;
    margin-top: 0.35rem;
  }
  li small,
  li .visit-meta {
    max-width: 42ch;
    color: var(--ink-soft);
  }
  li .successor {
    font-weight: 700;
  }
  .actions {
    display: grid;
    gap: 0.5rem;
    align-content: start;
  }
  .actions > a,
  .empty a,
  .next-page {
    min-height: 2.75rem;
    padding: 0.6rem 0.9rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    font-weight: 900;
    text-align: center;
  }
  .empty {
    display: grid;
    max-width: 34rem;
    margin-top: 2rem;
    padding: 2rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    gap: 0.6rem;
    background: var(--paper-light);
    box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--amber);
  }
  .empty span {
    font-size: 3rem;
  }
  .empty h2,
  .empty p {
    margin: 0;
  }
  .next-page {
    display: inline-block;
  }
  @media (max-width: 35rem) {
    li {
      grid-template-columns: 1fr;
    }
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
