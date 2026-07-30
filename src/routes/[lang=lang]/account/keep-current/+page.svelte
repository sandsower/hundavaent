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

<PageShell class="trusted-shell">
  <PageHeader class="trusted-header mb-section">
    <div class="header-icon" aria-hidden="true">
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
          <p class="weekly-note">{data.copy['trustedVerification.weeklyActivated']}</p>
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
        <Panel as="section" class="empty-state grid gap-context">
          <span aria-hidden="true">✓</span>
          <h3>{data.copy['trustedVerification.emptyTitle']}</h3>
          <p>{data.copy['trustedVerification.emptyBody']}</p>
        </Panel>
      {:else}
        <div class="task-grid">
          {#each data.tasks as task (task.taskId)}
            <Panel as="article" class="task-card grid gap-context" data-task-kind={task.taskKind}>
              <header>
                <div class="task-icon" aria-hidden="true">
                  <ImpactPillarIcon
                    kind={task.taskKind === 'access_freshness' ? 'knowledge' : 'contribution'}
                    size="small"
                  />
                </div>
                <div>
                  <p class="task-kind">
                    {task.taskKind === 'access_freshness'
                      ? data.copy['trustedVerification.kind.accessFreshness']
                      : data.copy['trustedVerification.kind.dogAmenities']}
                  </p>
                  <h3>{task.placeName}</h3>
                </div>
              </header>

              <p class="task-context">
                {localizePlaceCategory(task.category as PlaceCategory, data.copy)}
                <span aria-hidden="true">·</span>
                {task.municipality}
              </p>

              {#if task.taskKind === 'access_freshness'}
                <dl class="fact-list">
                  <div>
                    <dt>{data.copy['trustedVerification.accessArea']}</dt>
                    <dd>
                      {localizeAccessArea(
                        stringValue(task.currentValue.access_area) as AccessArea,
                        data.copy
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{data.copy['trustedVerification.restraint']}</dt>
                    <dd>
                      {localizeRestraint(
                        stringValue(task.currentValue.restraint_condition) as RestraintCondition,
                        data.copy
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{data.copy['trustedVerification.permission']}</dt>
                    <dd>
                      {localizePermission(
                        stringValue(
                          task.currentValue.permission_requirement
                        ) as PermissionRequirement,
                        data.copy
                      )}
                    </dd>
                  </div>
                  {#if task.freshnessUntil}
                    <div>
                      <dt>{data.copy['trustedVerification.freshnessUntil']}</dt>
                      <dd>{formatLocalizedDate(task.freshnessUntil, data.lang)}</dd>
                    </div>
                  {/if}
                </dl>
                <Meta class="my-[1em]">{data.copy['trustedVerification.accessHint']}</Meta>
              {:else}
                <p>{data.copy['trustedVerification.amenitiesHint']}</p>
              {/if}

              <details>
                <!-- Button cannot render a <summary> - details needs a real summary child to stay
                     accessible/native-toggleable, so this is the one control-look surface left as
                     a hand-styled non-Button element; the recipe below mirrors Button's primary
                     intent exactly (see the summary rule in <style>). -->
                <summary class="task-open-control">
                  {data.copy['trustedVerification.openTask']}
                </summary>
                <form
                  class="verification-form grid gap-context"
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
                    <p class="confirmation">
                      <span aria-hidden="true">✓</span>
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
      <Panel as="p" class="empty-history">{data.copy['trustedVerification.historyEmpty']}</Panel>
    {:else}
      <ul class="history-list">
        {#each data.history as item (item.submissionId)}
          <Panel as="li" class="history-item" data-outcome={item.outcome}>
            <span class="outcome-icon" aria-hidden="true">
              {item.outcome === 'accepted'
                ? '✓'
                : item.outcome === 'rejected' || item.outcome === 'revoked'
                  ? '–'
                  : item.outcome === 'superseded'
                    ? '↗'
                    : '•'}
            </span>
            <div>
              <div class="history-title">
                <h3>{item.placeName}</h3>
                <span class="outcome-label">{outcomeLabel(item.outcome)}</span>
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
                  class="history-link"
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
  /* trusted-shell and trusted-header now sit on PageShell/PageHeader's own rendered elements,
     outside this file's scope hash - re-anchored :global() (both classes are unique to this
     page, verified by repo grep). */
  :global(.trusted-shell) {
    --trusted-tone: var(--hv-color-moss);
    gap: clamp(2rem, 5vw, 4rem);
  }

  :global(.trusted-header) {
    align-items: center;
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .header-icon,
  .task-icon {
    --impact-tone: var(--trusted-tone);
  }

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

  .weekly-note {
    color: var(--hv-color-moss);
    font-weight: 700;
  }

  .task-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  /* task-card and history-item now sit on Panel's rendered <article>/<li> - re-anchored
     :global() (both unique to this page, verified by repo grep). header, h3 stay locally
     authored children passed into Panel, so they keep their normal scope hash for descendant
     selectors; the child combinator below is wrapped whole because Svelte's unused-selector
     checker cannot prove a `>` relationship across the Panel component boundary (it treats the
     rendered host element as opaque), even though the real DOM child relationship holds. */
  :global(.task-card) {
    align-content: start;
  }

  :global(.task-card > header) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.8rem;
    align-items: center;
  }

  :global(.task-card) h3,
  :global(.history-item) h3 {
    margin: 0;
  }

  .task-kind,
  .task-context {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.9rem;
    font-weight: 700;
  }

  .fact-list {
    display: grid;
    gap: 0.55rem;
    margin: 0;
  }

  .fact-list div {
    display: grid;
    grid-template-columns: minmax(7rem, 0.42fr) minmax(0, 1fr);
    gap: 0.75rem;
  }

  .fact-list dt {
    color: var(--hv-color-basalt-muted);
  }

  .fact-list dd {
    margin: 0;
    font-weight: 650;
  }

  details {
    margin-top: auto;
  }

  /* details needs a real summary child, so this is the one control-look surface left hand-styled
     rather than moved onto Button - the recipe below is an exact mirror of Button's primary
     intent (border-strong border, basalt fill, snow-raised text, the control height/radius/
     padding/weight, and the focus-visible ring + offset shadow) applied directly to a native
     element instead. */
  summary.task-open-control {
    display: inline-flex;
    width: fit-content;
    min-height: var(--hv-control-height);
    align-items: center;
    justify-content: center;
    border: 1px solid var(--hv-border-strong);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-basalt);
    padding: 0.55rem 0.8rem;
    color: var(--hv-color-snow-raised);
    font-weight: 800;
    cursor: pointer;
    list-style: none;
  }

  summary.task-open-control::-webkit-details-marker {
    display: none;
  }

  summary.task-open-control:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  .verification-form {
    margin-top: 1rem;
    border-top: 1px solid var(--hv-border-subtle);
    padding-top: 1rem;
  }

  .confirmation {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--hv-color-moss) 9%, white);
    padding: 0.8rem;
  }

  .confirmation span {
    color: var(--hv-color-moss);
    font-weight: 900;
  }

  /* empty-state now sits on Panel's rendered <section>, but "empty-state" is NOT unique to
     this page (also used by MapListShell, CheckInHistoryList, PersonalMapView, favorites) - a
     bare :global(.empty-state) would leak this page's styling onto those. Anchored on the
     locally-scoped .task-section ancestor (still a plain native element, unmoved) instead, so
     the compound selector can only match inside this page. */
  .task-section :global(.empty-state) {
    place-items: center;
    text-align: center;
  }

  .task-section :global(.empty-state > span) {
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--hv-color-moss) 14%, white);
    color: var(--hv-color-moss);
    font-size: 1.5rem;
    font-weight: 900;
  }

  .history-list {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* history-item now sits on Panel's rendered <li> - re-anchored :global() (unique to this
     page, verified by repo grep). */
  :global(.history-item) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.85rem;
    align-items: start;
  }

  .outcome-icon {
    display: grid;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--hv-color-moss) 12%, white);
    color: var(--hv-color-moss);
    font-weight: 900;
  }

  :global(.history-item[data-outcome='rejected']) .outcome-icon,
  :global(.history-item[data-outcome='revoked']) .outcome-icon,
  :global(.history-item[data-outcome='unavailable']) .outcome-icon {
    background: color-mix(in srgb, var(--hv-color-basalt-muted) 12%, white);
    color: var(--hv-color-basalt-muted);
  }

  .history-title {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: baseline;
    justify-content: space-between;
  }

  .outcome-label {
    border-radius: 999px;
    background: color-mix(in srgb, var(--hv-color-moss) 10%, white);
    padding: 0.25rem 0.55rem;
    color: var(--hv-color-moss);
    font-size: 0.82rem;
    font-weight: 750;
  }

  .history-link {
    color: var(--hv-color-moss);
    font-weight: 700;
  }

  /* empty-history now sits on Panel's rendered <p> - re-anchored :global() (unique to this
     page, verified by repo grep). */
  :global(.empty-history) {
    color: var(--hv-color-basalt-muted);
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

  @media (max-width: 760px) {
    :global(.trusted-header),
    .task-grid {
      grid-template-columns: 1fr;
    }

    :global(.trusted-header) .header-icon {
      display: none;
    }
  }
</style>
