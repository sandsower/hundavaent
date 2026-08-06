<script lang="ts">
  import { resolve } from '$app/paths';

  import { Button, Meta, Panel, Status } from '@hundavaent/design-system';
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
  <Panel
    as="section"
    class="history-empty-state grid gap-context"
    aria-labelledby="check-in-history-empty-title"
  >
    <h2 id="check-in-history-empty-title" tabindex="-1">{copy['history.emptyCheckInsTitle']}</h2>
    <p>{copy['history.emptyCheckInsBody']}</p>
    <Button href={resolve('/[lang=lang]', { lang })} intent="primary">
      {copy['favourite.backToDiscovery']}
    </Button>
  </Panel>
{:else if checkIns.length === 0}
  <Panel
    as="section"
    class="history-empty-state grid gap-context"
    aria-labelledby="check-in-history-page-empty-title"
  >
    <h2 id="check-in-history-page-empty-title" tabindex="-1">
      {copy['history.pageEmptyCheckInsTitle']}
    </h2>
    <p>{copy['history.pageEmptyCheckInsBody']}</p>
  </Panel>
{:else}
  <ol
    class="grid gap-context m-0 p-0 list-none check-in-list [margin-block:calc(var(--hv-space-context)*1.5)]!"
    aria-label={copy['history.tabCheckIns']}
  >
    {#each checkIns as checkIn (checkIn.checkInId)}
      <Panel
        as="li"
        padded
        class={checkIn.availability !== 'available' ? 'check-in-card unavailable' : 'check-in-card'}
        data-check-in-row
      >
        <div class="grid gap-context">
          <h2>{checkIn.name}</h2>
          <Meta>
            {copy['history.checkedInAt'].replace('{date}', formatDateTime(checkIn.checkedInAt))}
          </Meta>
          <Status
            tone={checkIn.availability === 'available' ? undefined : 'attention'}
            data-status={checkIn.availability === 'available' ? undefined : 'attention'}
          >
            {availabilityLabel(checkIn)}
          </Status>
          {#if checkIn.availability === 'inactive' && checkIn.successorPlaceId && checkIn.successorName}
            <p class="successor font-bold">
              {copy['history.successorNote'].replace('{name}', checkIn.successorName)}
            </p>
          {/if}
        </div>
        <div
          class="check-in-actions flex flex-wrap items-center gap-actions content-start justify-end max-[35rem]:justify-stretch"
        >
          {#if checkIn.availability === 'available'}
            <Button href={discoveryPlaceHref(checkIn.placeId)}>
              {copy['directory.openPlace']}
            </Button>
          {:else if checkIn.successorPlaceId && checkIn.successorAvailable}
            <!-- A successor is a Candidate at transition time and may not be published yet;
                 only a currently discoverable successor gets a discovery deep link. The name
                 itself is still shown honestly in the successor note above. -->
            <Button href={discoveryPlaceHref(checkIn.successorPlaceId)}>
              {copy['history.successorLink'].replace('{name}', checkIn.successorName ?? '')}
            </Button>
          {/if}
        </div>
      </Panel>
    {/each}
  </ol>

  {#if nextCursor}
    <Button href={nextPageHref(nextCursor)} intent="primary" class="history-next-page">
      {copy['history.nextPage']}
    </Button>
  {/if}
{/if}

<style>
  /* Panel renders its own element inside a child component, so this component's scoped CSS
     cannot reach it directly - the actual target selectors are wrapped in :global() and anchored
     through .check-in-list, the ancestor idiom FavouriteControl.svelte uses for its own
     child-component call sites. Elements written directly inside Panel's children (h2, p,
     .successor) stay reachable normally - only Panel's own rendered <li> needs the wrap. */
  .check-in-list :global(.check-in-card) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--hv-space-panel);
  }

  .check-in-list :global(.check-in-card.unavailable) {
    background: var(--hv-color-snow);
  }

  h2,
  .check-in-list :global(.check-in-card p) {
    margin: 0;
  }

  /* Panel's history-empty-state root is rendered by a child component too, and these two empty states
     sit at the top of the fragment with no native wrapping element in this component's own
     template to anchor a scoped :global() through - the same rootless situation
     favorites/+page.svelte's .saved-empty-state hook already carries. */
  :global(.history-empty-state) {
    max-width: 34rem;
    margin-top: calc(var(--hv-space-context) * 1.5);
    padding: var(--hv-space-panel);
  }

  :global(.history-empty-state) h2,
  :global(.history-empty-state) p {
    margin: 0;
  }

  /* Button's rendered anchor for pagination has no native wrapping ancestor either - same
     rootless case as .history-empty-state above. Page-unique name (favorites' equivalent is
     .saved-next-page): identically-named bare globals from two surfaces fight each other
     app-wide once route CSS is injected - the phase-4 .empty-state leak lesson. */
  :global(.history-next-page) {
    margin-top: 0.75rem;
  }

  @media (max-width: 35rem) {
    .check-in-list :global(.check-in-card) {
      grid-template-columns: 1fr;
    }
  }
</style>
