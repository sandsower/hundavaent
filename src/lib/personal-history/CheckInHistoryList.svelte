<script lang="ts">
  import { resolve } from '$app/paths';

  import type { Catalogue, Locale } from '$i18n';
  import type { PersonalCheckIn } from '$server/personal-history/personal-history';

  interface Props {
    checkIns: PersonalCheckIn[];
    lang: Locale;
    copy: Catalogue;
    isFirstPage: boolean;
    nextCursor: { beforeCheckedInAt: string; beforeCheckInId: string } | null;
  }

  let { checkIns, lang, copy, isFirstPage, nextCursor }: Props = $props();

  function availabilityLabel(checkIn: PersonalCheckIn): string {
    if (checkIn.availability === 'inactive') return copy['favourite.inactive'];
    if (checkIn.availability === 'unavailable') return copy['favourite.unavailable'];
    return copy['favourite.available'];
  }

  function discoveryPlaceHref(placeId: string): string {
    const path = resolve('/[lang=lang]', { lang });
    const query = new URLSearchParams({ place: placeId });
    return `${path}?${query}`;
  }

  function nextPageHref(cursor: { beforeCheckedInAt: string; beforeCheckInId: string }): string {
    const path = resolve('/[lang=lang]/history', { lang });
    const query = new URLSearchParams({
      view: 'checkins',
      before: cursor.beforeCheckedInAt,
      beforeCheckIn: cursor.beforeCheckInId
    });
    return `${path}?${query}`;
  }

  function formatDateTime(value: string): string {
    return new Intl.DateTimeFormat(lang === 'is' ? 'is-IS' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  }
</script>

{#if checkIns.length === 0 && isFirstPage}
  <section class="empty" aria-labelledby="check-in-history-empty-title">
    <span aria-hidden="true">🐾</span>
    <h2 id="check-in-history-empty-title" tabindex="-1">{copy['history.emptyCheckInsTitle']}</h2>
    <p>{copy['history.emptyCheckInsBody']}</p>
    <a href={resolve('/[lang=lang]', { lang })}>{copy['favourite.backToDiscovery']}</a>
  </section>
{:else if checkIns.length === 0}
  <section class="empty" aria-labelledby="check-in-history-page-empty-title">
    <span aria-hidden="true">🐾</span>
    <h2 id="check-in-history-page-empty-title" tabindex="-1">
      {copy['history.pageEmptyCheckInsTitle']}
    </h2>
    <p>{copy['history.pageEmptyCheckInsBody']}</p>
  </section>
{:else}
  <ol aria-label={copy['history.tabCheckIns']}>
    {#each checkIns as checkIn (checkIn.checkInId)}
      <li data-check-in-row class:unavailable={checkIn.availability !== 'available'}>
        <div>
          <h2>{checkIn.name}</h2>
          <p>
            {copy['history.checkedInAt'].replace('{date}', formatDateTime(checkIn.checkedInAt))}
          </p>
          <strong>{availabilityLabel(checkIn)}</strong>
          {#if checkIn.availability === 'inactive' && checkIn.successorPlaceId && checkIn.successorName}
            <p class="successor">
              {copy['history.successorNote'].replace('{name}', checkIn.successorName)}
            </p>
          {/if}
        </div>
        <div class="actions">
          {#if checkIn.availability === 'available'}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={discoveryPlaceHref(checkIn.placeId)}>{copy['directory.openPlace']}</a>
          {:else if checkIn.successorPlaceId && checkIn.successorAvailable}
            <!-- A successor is a Candidate at transition time and may not be published yet;
                 only a currently discoverable successor gets a discovery deep link. The name
                 itself is still shown honestly in the successor note above. -->
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={discoveryPlaceHref(checkIn.successorPlaceId)}>
              {copy['history.successorLink'].replace('{name}', checkIn.successorName ?? '')}
            </a>
          {/if}
        </div>
      </li>
    {/each}
  </ol>

  {#if nextCursor}
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a class="next-page" href={nextPageHref(nextCursor)}>{copy['history.nextPage']}</a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {/if}
{/if}

<style>
  ol {
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
  li .successor {
    display: block;
    margin-top: 0.35rem;
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
