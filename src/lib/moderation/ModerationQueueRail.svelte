<script lang="ts">
  import { Button } from '@hundavaent/design-system';
  import type { Catalogue, MessageKey } from '$i18n';

  import {
    buildModerationWorkspaceHref,
    type ModerationFilterId,
    type ModerationQueueId,
    type ModerationQueueSummary
  } from './types';

  interface Props {
    copy: Catalogue;
    baseHref: string;
    queues: readonly ModerationQueueSummary[];
    activeQueueId: ModerationQueueId;
    filters: readonly ModerationFilterId[];
  }

  let { copy, baseHref, queues, activeQueueId, filters }: Props = $props();

  const queueKeys: Record<ModerationQueueId, MessageKey> = {
    suggestions: 'moderation.workspace.queue.suggestions',
    'corrections-and-reports': 'moderation.workspace.queue.correctionsAndReports',
    'candidate-places': 'moderation.workspace.queue.candidatePlaces'
  };
</script>

<nav
  class="queue-rail min-w-0 min-h-0 overflow-y-auto overscroll-contain p-[0.9rem] border-r border-r-border-subtle bg-snow max-[60rem]:overflow-x-auto max-[60rem]:overflow-y-hidden max-[60rem]:p-[0.65rem] max-[60rem]:border-r-0 max-[60rem]:border-b max-[60rem]:border-b-border-subtle max-[44rem]:overflow-x-hidden max-[44rem]:p-[0.55rem]"
  aria-label={copy['moderation.workspace.queueNavLabel']}
>
  <h2
    class="mx-[0.55rem] mt-[0.25rem] mb-[0.7rem] text-[0.78rem] font-extrabold tracking-[0.09em] uppercase max-[60rem]:absolute max-[60rem]:w-px max-[60rem]:h-px max-[60rem]:overflow-hidden max-[60rem]:whitespace-nowrap max-[60rem]:[clip:rect(0_0_0_0)] max-[60rem]:[clip-path:inset(50%)]"
  >
    {copy['moderation.workspace.queuesHeading']}
  </h2>
  <!-- Workspace URLs are canonicalized from a resolved localized base route and query state. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <div
    class="queue-links grid gap-[0.4rem] max-[60rem]:flex max-[60rem]:w-max max-[60rem]:gap-[0.45rem] max-[44rem]:grid max-[44rem]:w-full max-[44rem]:grid-cols-3 max-[44rem]:gap-[0.35rem]"
  >
    {#each queues as queue (queue.id)}
      <Button
        class="queue-link"
        intent={queue.id === activeQueueId ? 'committed' : 'neutral'}
        aria-current={queue.id === activeQueueId ? 'page' : undefined}
        href={buildModerationWorkspaceHref(baseHref, {
          queue: queue.id,
          filters
        })}
      >
        <span>{copy[queueKeys[queue.id]]}</span>
        <span
          class="count min-w-7 px-[0.42rem] py-[0.18rem] rounded-control bg-basalt text-[0.72rem] font-extrabold text-center text-snow-raised max-[44rem]:min-w-6 max-[44rem]:px-[0.35rem] max-[44rem]:py-[0.12rem] max-[44rem]:text-[0.66rem]"
          >{queue.count}</span
        >
      </Button>
    {/each}
  </div>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</nav>

<style>
  /* Button renders its own <a> inside a child component, so Svelte's scoped CSS cannot reach it
     directly - the .queue-link class is guaranteed to land on that rendered element because we
     pass it through Button's class prop ourselves (the FavouriteControl precedent). Border
     colour, background, text colour, weight, and focus ring now come from Button's intent/base
     classes; only the rail-specific grid layout for the label + count pair survives here. */
  .queue-rail :global(.queue-link) {
    display: grid;
    box-sizing: border-box;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.55rem;
    padding: 0.65rem;
    text-decoration: none;
  }
  @media (max-width: 60rem) {
    .queue-rail :global(.queue-link) {
      width: auto;
      flex: none;
      white-space: nowrap;
    }
  }
  @media (max-width: 44rem) {
    .queue-rail :global(.queue-link) {
      width: 100%;
      min-height: 4.25rem;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 1fr auto;
      gap: 0.25rem;
      justify-items: center;
      padding: 0.45rem 0.25rem;
      font-size: 0.75rem;
      line-height: 1.15;
      text-align: center;
      white-space: normal;
    }
  }
</style>
