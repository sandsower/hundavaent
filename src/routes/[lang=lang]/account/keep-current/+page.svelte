<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import {
    Button,
    Eyebrow,
    Field,
    Input,
    Meta,
    Notice,
    PageHeader,
    PageShell,
    PageTitle,
    Panel,
    Select,
    Textarea
  } from '@hundavaent/design-system';
  import { formatLocalizedDate } from '$i18n/date';
  import {
    localizeAccessArea,
    localizePermission,
    localizePlaceCategory,
    localizeRestraint
  } from '$i18n/structured-place';
  import type { AccessArea, PermissionRequirement, RestraintCondition } from '$lib/domain/access';
  import type { PlaceCategory } from '$lib/domain/place';
  import ImpactPillarIcon from '$lib/impact/ImpactPillarIcon.svelte';

  import type { ActionData, PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submittingTaskId = $state<string | null>(null);

  const formState = $derived(form as ActionData | null);
  const canVerify = $derived((data as typeof data & { canVerify?: boolean }).canVerify ?? true);

  function enhanceTask(taskId: string) {
    submittingTaskId = taskId;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      submittingTaskId = null;
    };
  }

  function stringValue(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  function outcomeLabel(outcome: string): string {
    const key = `trustedVerification.outcome.${outcome}` as keyof typeof data.copy;
    return data.copy[key] ?? outcome;
  }
</script>

<svelte:head>
  <title>{data.copy['trustedVerification.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<!-- trusted-shell and trusted-header now sit on PageShell/PageHeader's own rendered elements,
     outside this file's scope hash - re-anchored :global() (both classes are unique to this
     page, verified by repo grep). -->
<PageShell class="trusted-shell gap-[clamp(2rem,5vw,4rem)] [--trusted-tone:var(--hv-color-moss)]">
  <PageHeader
    class="trusted-header grid-cols-[auto_minmax(0,1fr)_auto] items-center mb-section max-[760px]:grid-cols-[1fr]"
  >
    <div
      class="header-icon [--impact-tone:var(--trusted-tone)] max-[760px]:hidden"
      aria-hidden="true"
    >
      <ImpactPillarIcon kind="recognition" size="large" />
    </div>
    <!-- The one header that keeps a heading-group wrapper: .trusted-header lays its three bands
         out as columns (icon | heading | actions, see the grid-template-columns rule below), so
         the eyebrow/title/intro must stay one grid item. gap-panel inside reproduces the old
         hv-page-heading rhythm. -->
    <div class="grid gap-panel">
      <Eyebrow>{data.copy['trustedVerification.eyebrow']}</Eyebrow>
      <PageTitle>{data.copy['trustedVerification.title']}</PageTitle>
      <Meta>{data.copy['trustedVerification.intro']}</Meta>
    </div>
    <div class="flex flex-wrap items-center gap-actions">
      <Button href={resolve('/[lang=lang]/account', { lang: data.lang })}>
        {data.copy['trustedVerification.backToAccount']}
      </Button>
    </div>
  </PageHeader>

  {#if formState?.success}
    <Panel
      as="section"
      class="submission-celebration grid gap-context"
      aria-live="polite"
      data-testid="trusted-submission-success"
    >
      <span class="celebration-icon" aria-hidden="true">
        <ImpactPillarIcon kind="contribution" size="large" />
      </span>
      <div>
        <h2>{data.copy['trustedVerification.submittedTitle']}</h2>
        <p>{data.copy['trustedVerification.submittedBody']}</p>
        {#if formState.weeklyActivated}
          <p class="weekly-note font-bold text-moss">
            {data.copy['trustedVerification.weeklyActivated']}
          </p>
        {/if}
      </div>
    </Panel>
  {:else if formState?.error}
    <Notice tone="error" as="p" role="alert">
      {formState.error === 'forbidden'
        ? data.copy['trustedVerification.trustedRequired']
        : formState.error === 'rate_limited'
          ? data.copy['trustedVerification.rateLimited']
          : formState.error === 'conflict'
            ? data.copy['trustedVerification.conflict']
            : formState.error === 'policy_unavailable'
              ? data.copy['trustedVerification.policyUnavailable']
              : data.copy['trustedVerification.invalid']}
    </Notice>
  {/if}

  {#if !canVerify}
    <Notice tone="info" as="p" role="status">
      {data.copy['trustedVerification.trustedRequired']}
    </Notice>
  {/if}

  {#if canVerify}
    <section class="task-section grid gap-context" aria-labelledby="task-heading">
      <div>
        <Eyebrow>{data.copy['trustedVerification.taskEyebrow']}</Eyebrow>
        <h2 id="task-heading">{data.copy['trustedVerification.taskHeading']}</h2>
        <Meta>{data.copy['trustedVerification.taskIntro']}</Meta>
      </div>

      {#if data.tasks.length === 0}
        <!-- empty-state now sits on Panel's rendered <section>, but "empty-state" is NOT unique to
             this page (also used by MapListShell, CheckInHistoryList, PersonalMapView, favorites) - a
             bare :global(.empty-state) would leak this page's styling onto those. Anchored on the
             locally-scoped .task-section ancestor (still a plain native element, unmoved) instead, so
             the compound selector can only match inside this page. -->
        <Panel as="section" class="empty-state grid place-items-center gap-context text-center">
          <span
            aria-hidden="true"
            class="grid place-items-center w-12 h-12 rounded-full bg-[color-mix(in_srgb,var(--hv-color-moss)_14%,white)] text-[1.5rem] font-black text-moss"
            >✓</span
          >
          <h3>{data.copy['trustedVerification.emptyTitle']}</h3>
          <p>{data.copy['trustedVerification.emptyBody']}</p>
        </Panel>
      {:else}
        <div class="task-grid grid grid-cols-2 gap-4 max-[760px]:grid-cols-[1fr]">
          {#each data.tasks as task (task.taskId)}
            <!-- task-card and history-item now sit on Panel's rendered <article>/<li> - re-anchored
                 :global() (both unique to this page, verified by repo grep). header, h3 stay locally
                 authored children passed into Panel, so they keep their normal scope hash for descendant
                 selectors; the child combinator below is wrapped whole because Svelte's unused-selector
                 checker cannot prove a `>` relationship across the Panel component boundary (it treats the
                 rendered host element as opaque), even though the real DOM child relationship holds. -->
            <Panel
              as="article"
              class="task-card grid content-start gap-context"
              data-task-kind={task.taskKind}
            >
              <header class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[0.8rem]">
                <div class="task-icon [--impact-tone:var(--trusted-tone)]" aria-hidden="true">
                  <ImpactPillarIcon
                    kind={task.taskKind === 'access_freshness' ? 'knowledge' : 'contribution'}
                    size="small"
                  />
                </div>
                <div>
                  <p class="task-kind m-0 text-[0.9rem] font-bold text-basalt-muted">
                    {task.taskKind === 'access_freshness'
                      ? data.copy['trustedVerification.kind.accessFreshness']
                      : data.copy['trustedVerification.kind.dogAmenities']}
                  </p>
                  <h3 class="m-0">{task.placeName}</h3>
                </div>
              </header>

              <p class="task-context m-0 text-[0.9rem] font-bold text-basalt-muted">
                {localizePlaceCategory(task.category as PlaceCategory, data.copy)}
                <span aria-hidden="true">·</span>
                {task.municipality}
              </p>

              {#if task.taskKind === 'access_freshness'}
                <dl class="fact-list grid gap-[0.55rem] m-0">
                  <div class="grid grid-cols-[minmax(7rem,0.42fr)_minmax(0,1fr)] gap-3">
                    <dt class="text-basalt-muted">{data.copy['trustedVerification.accessArea']}</dt>
                    <dd class="m-0 font-[650]">
                      {localizeAccessArea(
                        stringValue(task.currentValue.access_area) as AccessArea,
                        data.copy
                      )}
                    </dd>
                  </div>
                  <div class="grid grid-cols-[minmax(7rem,0.42fr)_minmax(0,1fr)] gap-3">
                    <dt class="text-basalt-muted">{data.copy['trustedVerification.restraint']}</dt>
                    <dd class="m-0 font-[650]">
                      {localizeRestraint(
                        stringValue(task.currentValue.restraint_condition) as RestraintCondition,
                        data.copy
                      )}
                    </dd>
                  </div>
                  <div class="grid grid-cols-[minmax(7rem,0.42fr)_minmax(0,1fr)] gap-3">
                    <dt class="text-basalt-muted">{data.copy['trustedVerification.permission']}</dt>
                    <dd class="m-0 font-[650]">
                      {localizePermission(
                        stringValue(
                          task.currentValue.permission_requirement
                        ) as PermissionRequirement,
                        data.copy
                      )}
                    </dd>
                  </div>
                  {#if task.freshnessUntil}
                    <div class="grid grid-cols-[minmax(7rem,0.42fr)_minmax(0,1fr)] gap-3">
                      <dt class="text-basalt-muted">
                        {data.copy['trustedVerification.freshnessUntil']}
                      </dt>
                      <dd class="m-0 font-[650]">
                        {formatLocalizedDate(task.freshnessUntil, data.lang)}
                      </dd>
                    </div>
                  {/if}
                </dl>
                <Meta class="my-[1em]">{data.copy['trustedVerification.accessHint']}</Meta>
              {:else}
                <p>{data.copy['trustedVerification.amenitiesHint']}</p>
              {/if}

              <details class="mt-auto">
                <!-- Button cannot render a <summary> - details needs a real summary child to stay
                     accessible/native-toggleable, so this is the one control-look surface left as
                     a hand-styled non-Button element; the recipe below mirrors Button's primary
                     intent exactly (see the summary rule in <style>). -->
                <!-- details needs a real summary child, so this is the one control-look surface left
                     hand-styled rather than moved onto Button - the recipe below is an exact mirror of
                     Button's primary intent (border-strong border, basalt fill, snow-raised text, the
                     control height/radius/padding/weight, and the focus-visible ring + offset shadow)
                     applied directly to a native element instead. -->
                <summary
                  class="task-open-control inline-flex items-center justify-center w-fit min-h-control py-[0.55rem] px-[0.8rem] border border-border-strong rounded-control bg-basalt font-extrabold text-snow-raised list-none cursor-pointer focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
                >
                  {data.copy['trustedVerification.openTask']}
                </summary>
                <form
                  class="verification-form grid gap-context mt-4 pt-4 border-t border-t-border-subtle"
                  method="POST"
                  use:enhance={() => enhanceTask(task.taskId)}
                  aria-busy={submittingTaskId === task.taskId}
                >
                  <input type="hidden" name="taskId" value={task.taskId} />
                  <input type="hidden" name="commandId" value={data.taskRequestIds[task.taskId]} />

                  {#if task.taskKind === 'dog_amenities'}
                    <Field
                      label={data.copy['trustedVerification.amenitiesLabel']}
                      hint={data.copy['trustedVerification.amenitiesHelp']}
                    >
                      <Input
                        name="amenities"
                        placeholder={data.copy['trustedVerification.amenitiesPlaceholder']}
                        required
                      />
                    </Field>
                  {:else}
                    <p
                      class="confirmation flex items-center gap-[0.55rem] p-[0.8rem] rounded-[0.8rem] bg-[color-mix(in_srgb,var(--hv-color-moss)_9%,white)]"
                    >
                      <span aria-hidden="true" class="font-black text-moss">✓</span>
                      {data.copy['trustedVerification.confirmAccess']}
                    </p>
                  {/if}

                  <!-- Not migrated to FormSection on purpose: this fieldset carries only the
                       bare grid gap-panel min-w-0 recipe (no Panel treatment), a grid+gap layout
                       with no border, padding, background, or shadow. FormSection always renders
                       the full panel look (Panel's border/background/shadow set), so wrapping
                       this one would add a border/shadow/background that is not part of today's
                       baseline - a real visual regression, not one of the two approved deltas.
                       Left as the native fieldset+legend pair; only its controls move to
                       Field/Select/Input. -->
                  <fieldset class="grid gap-panel min-w-0">
                    <legend>{data.copy['evidenceField.section']}</legend>
                    <div class="grid grid-cols-2 gap-context max-narrow:grid-cols-1">
                      <Field label={data.copy['evidenceField.kind']}>
                        <Select name="evidenceKind" required>
                          <option value="direct_observation">
                            {data.copy['evidence.directObservation']}
                          </option>
                          <option value="official_website">
                            {data.copy['evidence.officialWebsite']}
                          </option>
                          <option value="venue_representative">
                            {data.copy['evidence.venueRepresentative']}
                          </option>
                          <option value="public_record">{data.copy['evidence.publicRecord']}</option
                          >
                          <option value="other">{data.copy['evidence.other']}</option>
                        </Select>
                      </Field>
                      <Field label={data.copy['evidenceField.label']}>
                        <Input name="evidenceSourceLabel" required />
                      </Field>
                    </div>
                    <div class="grid grid-cols-2 gap-context max-narrow:grid-cols-1">
                      <Field label={data.copy['evidenceField.url']}>
                        <Input name="evidenceUrl" type="url" />
                      </Field>
                      <Field label={data.copy['evidenceField.citation']}>
                        <Input name="evidenceCitation" />
                      </Field>
                    </div>
                    <Field label={data.copy['evidenceField.observedAt']}>
                      <Input name="evidenceObservedAt" type="datetime-local" required />
                    </Field>
                  </fieldset>

                  <Field
                    label={data.copy['trustedVerification.explanationLabel']}
                    hint={data.copy['trustedVerification.privacyNote']}
                  >
                    <Textarea name="explanation" required></Textarea>
                  </Field>

                  <Button intent="primary" type="submit" disabled={submittingTaskId !== null}>
                    {submittingTaskId === task.taskId
                      ? data.copy['trustedVerification.sending']
                      : data.copy['trustedVerification.submit']}
                  </Button>
                </form>
              </details>
            </Panel>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <section class="history-section grid gap-context" aria-labelledby="history-heading">
    <div>
      <Eyebrow>{data.copy['trustedVerification.historyEyebrow']}</Eyebrow>
      <h2 id="history-heading">{data.copy['trustedVerification.historyHeading']}</h2>
      <Meta>{data.copy['trustedVerification.historyIntro']}</Meta>
    </div>

    {#if data.history.length === 0}
      <!-- empty-history now sits on Panel's rendered <p> - re-anchored :global() (unique to this
           page, verified by repo grep). -->
      <Panel as="p" class="empty-history text-basalt-muted"
        >{data.copy['trustedVerification.historyEmpty']}</Panel
      >
    {:else}
      <ul class="history-list grid gap-3 m-0 p-0 list-none">
        {#each data.history as item (item.submissionId)}
          <!-- history-item now sits on Panel's rendered <li> - re-anchored :global() (unique to this
               page, verified by repo grep). -->
          <Panel
            as="li"
            class="history-item group/history grid grid-cols-[auto_minmax(0,1fr)] items-start gap-[0.85rem]"
            data-outcome={item.outcome}
          >
            <span
              class="outcome-icon grid place-items-center w-[2.2rem] h-[2.2rem] rounded-full bg-[color-mix(in_srgb,var(--hv-color-moss)_12%,white)] font-black text-moss group-data-[outcome=rejected]/history:bg-[color-mix(in_srgb,var(--hv-color-basalt-muted)_12%,white)] group-data-[outcome=rejected]/history:text-basalt-muted group-data-[outcome=revoked]/history:bg-[color-mix(in_srgb,var(--hv-color-basalt-muted)_12%,white)] group-data-[outcome=revoked]/history:text-basalt-muted group-data-[outcome=unavailable]/history:bg-[color-mix(in_srgb,var(--hv-color-basalt-muted)_12%,white)] group-data-[outcome=unavailable]/history:text-basalt-muted"
              aria-hidden="true"
            >
              {item.outcome === 'accepted'
                ? '✓'
                : item.outcome === 'rejected' || item.outcome === 'revoked'
                  ? '–'
                  : item.outcome === 'superseded'
                    ? '↗'
                    : '•'}
            </span>
            <div>
              <div class="history-title flex flex-wrap items-baseline justify-between gap-[0.6rem]">
                <h3 class="m-0">{item.placeName}</h3>
                <span
                  class="outcome-label py-1 px-[0.55rem] rounded-[999px] bg-[color-mix(in_srgb,var(--hv-color-moss)_10%,white)] text-[0.82rem] font-[750] text-moss"
                  >{outcomeLabel(item.outcome)}</span
                >
              </div>
              <Meta>
                {item.taskKind === 'access_freshness'
                  ? data.copy['trustedVerification.kind.accessFreshness']
                  : data.copy['trustedVerification.kind.dogAmenities']}
                ·
                {formatLocalizedDate(item.submittedAt, data.lang)}
              </Meta>
              {#if item.memberReason}<p>{item.memberReason}</p>{/if}
              {#if item.outcome === 'accepted'}
                <a
                  class="history-link font-bold text-moss"
                  href={resolve('/[lang=lang]/places/[id]', {
                    lang: data.lang,
                    id: item.placeId
                  })}
                >
                  {data.copy['trustedVerification.viewPlace']}
                </a>
              {/if}
            </div>
          </Panel>
        {/each}
      </ul>
    {/if}
  </section>
</PageShell>

<style>
  /* submission-celebration now sits on Panel's rendered <section> - re-anchored :global()
     (unique to this page, verified by repo grep). */
  :global(.submission-celebration) {
    --impact-tone: var(--hv-color-moss);
    position: relative;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    overflow: hidden;
    border-color: color-mix(in srgb, var(--hv-color-moss) 42%, var(--hv-border-subtle));
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--hv-color-moss) 14%, var(--hv-color-snow-raised)) 0%,
      var(--hv-color-snow-raised) 32%
    );
  }

  .celebration-icon {
    /* Moves and fades, so it runs as two entries, one per family (see tokens.css). */
    animation:
      trusted-arrival var(--hv-motion-celebrate) var(--hv-ease-overshoot) both,
      trusted-appears var(--hv-fade-considered) var(--hv-ease-settle) both;
  }

  /* stays: a vendor pseudo-element Tailwind has no variant for. `list-none` on the summary above
     covers the standard ::marker; this is the Safari/WebKit half of the same suppression. */
  summary.task-open-control::-webkit-details-marker {
    display: none;
  }

  @keyframes trusted-arrival {
    from {
      transform: translateY(0.65rem) rotate(-5deg) scale(0.88);
    }
    to {
      transform: translateY(0) rotate(0) scale(1);
    }
  }

  @keyframes trusted-appears {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
