<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type { AchievementMilestone } from '$server/achievements/achievements';
  import AchievementIcon from './AchievementIcon.svelte';

  interface Props {
    milestone: AchievementMilestone;
    lang: Locale;
    copy: Catalogue;
  }

  let { milestone, lang, copy }: Props = $props();

  const name = $derived(lang === 'is' ? milestone.nameIs : milestone.nameEn);
  const description = $derived(lang === 'is' ? milestone.descriptionIs : milestone.descriptionEn);
  const progressKey = $derived(`achievements.progress.${milestone.progress.kind}` as MessageKey);
  const progressLabel = $derived(
    copy[progressKey]
      .replace('{current}', String(milestone.progress.current))
      .replace('{target}', String(milestone.progress.target))
  );
  const progressPercent = $derived(
    `${Math.round((milestone.progress.current / milestone.progress.target) * 100)}%`
  );
</script>

<article class="milestone hv-panel" data-achievement-milestone>
  <div class="icon-frame">
    <AchievementIcon achievementKey={milestone.key} group={milestone.group} />
  </div>
  <div class="content">
    <h3>{name}</h3>
    <p class="description">{description}</p>
    <div
      class="progress"
      role="progressbar"
      aria-label={progressLabel}
      aria-valuemin="0"
      aria-valuemax={milestone.progress.target}
      aria-valuenow={milestone.progress.current}
    >
      <span class="progress-fill" style:width={progressPercent}></span>
    </div>
    <p class="progress-label">{progressLabel}</p>
  </div>
</article>

<style>
  .milestone {
    display: grid;
    grid-template-columns: 3.4rem minmax(0, 1fr);
    gap: 1rem;
    padding: 1.05rem;
    border-color: color-mix(in srgb, var(--hv-color-fjord) 25%, transparent);
    background: color-mix(in srgb, var(--hv-color-fjord) 3%, var(--hv-color-snow-raised));
  }

  .icon-frame {
    display: grid;
    width: 3.4rem;
    height: 3.4rem;
    border-radius: 1.15rem;
    background: color-mix(in srgb, var(--hv-color-fjord) 13%, white);
    color: var(--hv-color-fjord);
    padding: 0.72rem;
    place-items: center;
  }

  h3,
  .description,
  .progress-label {
    margin: 0;
  }

  h3 {
    font-family: var(--hv-font-display);
    font-size: 1.08rem;
    line-height: 1.2;
  }

  .description {
    margin-block-start: 0.3rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.92rem;
    line-height: 1.45;
  }

  .progress {
    height: 0.55rem;
    margin-block-start: 0.8rem;
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in srgb, var(--hv-color-fjord) 13%, var(--hv-color-snow));
    box-shadow: inset 0 1px 2px rgb(30 45 49 / 12%);
  }

  .progress-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--hv-color-fjord), var(--hv-color-moss));
  }

  .progress-label {
    margin-block-start: 0.42rem;
    color: var(--hv-color-basalt);
    font-size: 0.82rem;
    font-weight: 800;
  }

  @media (max-width: 26rem) {
    .milestone {
      grid-template-columns: 2.9rem minmax(0, 1fr);
      gap: 0.75rem;
    }

    .icon-frame {
      width: 2.9rem;
      height: 2.9rem;
      padding: 0.62rem;
    }
  }
</style>
