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
  <section class="empty-state hv-panel hv-stack" aria-labelledby="check-in-history-empty-title">
    <h2 id="check-in-history-empty-title" tabindex="-1">{copy['history.emptyCheckInsTitle']}</h2>
    <p>{copy['history.emptyCheckInsBody']}</p>
    <a class="hv-control" data-intent="primary" href={resolve('/[lang=lang]', { lang })}
      >{copy['favourite.backToDiscovery']}</a
    >
  </section>
{:else if checkIns.length === 0}
  <section
    class="empty-state hv-panel hv-stack"
    aria-labelledby="check-in-history-page-empty-title"
  >
    <h2 id="check-in-history-page-empty-title" tabindex="-1">
      {copy['history.pageEmptyCheckInsTitle']}
    </h2>
    <p>{copy['history.pageEmptyCheckInsBody']}</p>
  </section>
{:else}
  <ol class="hv-list check-in-list" aria-label={copy['history.tabCheckIns']}>
    {#each checkIns as checkIn (checkIn.checkInId)}
      <li
        class="check-in-card hv-list-card hv-panel"
        data-check-in-row
        class:unavailable={checkIn.availability !== 'available'}
      >
        <div class="hv-stack">
          <h2>{checkIn.name}</h2>
          <p class="hv-meta">
            {copy['history.checkedInAt'].replace('{date}', formatDateTime(checkIn.checkedInAt))}
          </p>
          <strong
            class="hv-status"
            data-status={checkIn.availability === 'available' ? undefined : 'attention'}
            >{availabilityLabel(checkIn)}</strong
          >
          {#if checkIn.availability === 'inactive' && checkIn.successorPlaceId && checkIn.successorName}
            <p class="successor">
              {copy['history.successorNote'].replace('{name}', checkIn.successorName)}
            </p>
          {/if}
        </div>
        <div class="check-in-actions hv-page-actions">
          {#if checkIn.availability === 'available'}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a class="hv-control" href={discoveryPlaceHref(checkIn.placeId)}
              >{copy['directory.openPlace']}</a
            >
          {:else if checkIn.successorPlaceId && checkIn.successorAvailable}
            <!-- A successor is a Candidate at transition time and may not be published yet;
                 only a currently discoverable successor gets a discovery deep link. The name
                 itself is still shown honestly in the successor note above. -->
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a class="hv-control" href={discoveryPlaceHref(checkIn.successorPlaceId)}>
              {copy['history.successorLink'].replace('{name}', checkIn.successorName ?? '')}
            </a>
          {/if}
        </div>
      </li>
    {/each}
  </ol>

  {#if nextCursor}
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a class="next-page hv-control" data-intent="primary" href={nextPageHref(nextCursor)}
      >{copy['history.nextPage']}</a
    >
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {/if}
{/if}

<style>
  .check-in-list {
    margin-block: calc(var(--hv-space-context) * 1.5);
  }

  .check-in-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--hv-space-panel);
  }

  .check-in-card.unavailable {
    background: var(--hv-color-snow);
  }

  h2,
  .check-in-card p {
    margin: 0;
  }

  .check-in-card .successor {
    font-weight: 700;
  }

  .check-in-actions {
    align-content: start;
    justify-content: end;
  }

  .empty-state {
    max-width: 34rem;
    margin-top: calc(var(--hv-space-context) * 1.5);
    padding: var(--hv-space-panel);
  }

  .empty-state h2,
  .empty-state p {
    margin: 0;
  }

  .next-page {
    margin-top: 0.75rem;
  }

  @media (max-width: 35rem) {
    .check-in-card {
      grid-template-columns: 1fr;
    }

    .check-in-actions {
      justify-content: stretch;
    }
  }
</style>
