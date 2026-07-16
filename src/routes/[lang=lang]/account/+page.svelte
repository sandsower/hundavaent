<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';

  import { formatLocalizedDate } from '$i18n/date';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
  let settingsOpen = $state(false);

  const enhanceAction: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

  const errorCode = $derived(form && 'error' in form ? form.error : data.authStatus);
  const successCode = $derived(form && 'success' in form ? form.success : null);
  const emailValue = $derived(form && 'email' in form ? form.email : '');

  function providerLabel(provider: string): string {
    if (provider === 'facebook') return data.copy['account.providerFacebook'];
    if (provider === 'email') return data.copy['account.providerEmail'];
    return data.copy['account.providerUnknown'];
  }
</script>

<svelte:head>
  <title
    >{data.member ? data.copy['account.signedInTitle'] : data.copy['account.title']} | {data.copy[
      'site.name'
    ]}</title
  >
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="account-shell hv-page-shell" data-ui-mode="place" data-width="narrow">
  {#if data.member}
    <section class="account-card signed-in hv-panel hv-stack" aria-labelledby="account-title">
      <header class="hv-page-header">
        <p class="eyebrow hv-eyebrow">{data.copy['site.name']}</p>
        <h1 class="hv-page-title" id="account-title">{data.copy['account.signedInTitle']}</h1>
        <p class="intro hv-meta">{data.copy['account.signedInIntro']}</p>
      </header>

      {#if errorCode}
        <p class="message error hv-notice" data-tone="error" role="alert">
          {errorCode === 'authentication_required'
            ? data.copy['account.authenticationRequired']
            : data.copy['account.authUnavailable']}
        </p>
      {/if}

      {#if successCode === 'deletion_requested' || data.member.deletionStatus === 'requested'}
        <p class="message success hv-notice" data-tone="success" role="status">
          {data.copy['account.deletionRequested']}
        </p>
      {/if}

      <div class="account-home hv-grid" data-columns="2">
        <section class="account-destination hv-panel hv-list-card" aria-labelledby="saved-heading">
          <h2 id="saved-heading">{data.copy['account.savedHeading']}</h2>
          <p>{data.copy['account.savedIntro']}</p>
          <a class="hv-control" href={resolve('/[lang=lang]/favorites', { lang: data.lang })}>
            {data.copy['favourite.savedLink']}
          </a>
        </section>

        <section class="account-destination hv-panel hv-list-card" aria-labelledby="visits-heading">
          <h2 id="visits-heading">{data.copy['account.visitsHeading']}</h2>
          <p>{data.copy['account.visitsIntro']}</p>
          <a class="hv-control" href={resolve('/[lang=lang]/history', { lang: data.lang })}>
            {data.copy['history.navLink']}
          </a>
        </section>

        <section
          class="account-destination contributions hv-panel hv-list-card"
          aria-labelledby="contributions-heading"
        >
          <h2 id="contributions-heading">{data.copy['account.contributionsHeading']}</h2>
          <p>{data.copy['account.contributionsIntro']}</p>
          <div class="destination-links hv-page-actions">
            <a class="hv-control" href={resolve('/[lang=lang]/suggest', { lang: data.lang })}>
              {data.copy['suggestion.nav']}
            </a>
            <a
              class="hv-control"
              href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}
            >
              {data.copy['suggestion.myTitle']}
            </a>
            <a
              class="hv-control"
              href={resolve('/[lang=lang]/account/contributor-status', { lang: data.lang })}
            >
              {data.copy['contributor.nav']}
            </a>
            <a
              class="hv-control"
              href={resolve('/[lang=lang]/account/achievements', { lang: data.lang })}
            >
              {data.copy['achievements.nav']}
            </a>
          </div>
        </section>

        {#if data.canModerate}
          <section
            class="account-destination moderation hv-panel hv-list-card"
            aria-labelledby="moderation-heading"
          >
            <h2 id="moderation-heading">{data.copy['account.moderationHeading']}</h2>
            <p>{data.copy['account.moderationIntro']}</p>
            <a class="hv-control" href={resolve('/[lang=lang]/moderation', { lang: data.lang })}>
              {data.copy['account.moderationLink']}
            </a>
          </section>
        {/if}
      </div>

      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a class="back-link discovery-link hv-control" href={data.returnTo}
        >{data.copy['account.backToPlace']}</a
      >

      <div class="settings">
        <button
          type="button"
          class="settings-toggle"
          aria-expanded={settingsOpen}
          onclick={() => (settingsOpen = !settingsOpen)}
        >
          {data.copy['account.settingsHeading']}
        </button>
        {#if settingsOpen}
          <div class="settings-body hv-stack">
            <section class="identity hv-form-section hv-panel" aria-labelledby="identity-heading">
              <h2 id="identity-heading">{data.copy['account.identityHeading']}</h2>
              <dl>
                <div>
                  <dt>{data.copy['account.emailIdentity']}</dt>
                  <dd>{data.member.email || data.copy['account.emailUnavailable']}</dd>
                </div>
                <div>
                  <dt>{data.copy['account.providerIdentity']}</dt>
                  <dd>{providerLabel(data.member.provider)}</dd>
                </div>
                <div>
                  <dt>{data.copy['account.memberSince']}</dt>
                  <dd>{formatLocalizedDate(data.member.createdAt, data.lang)}</dd>
                </div>
              </dl>
            </section>

            <form method="POST" action="?/signOut" use:enhance={enhanceAction}>
              <input type="hidden" name="returnTo" value={data.returnTo} />
              <button class="secondary hv-control" type="submit" disabled={submitting}
                >{data.copy['account.signOut']}</button
              >
            </form>

            <section class="deletion hv-form-section hv-panel" aria-labelledby="deletion-heading">
              <h2 id="deletion-heading">{data.copy['account.deletionHeading']}</h2>
              <p>{data.copy['account.deletionExplanation']}</p>
              {#if data.member.deletionStatus !== 'requested'}
                <form method="POST" action="?/requestDeletion" use:enhance={enhanceAction}>
                  <button class="danger hv-control" type="submit" disabled={submitting}>
                    {data.copy['account.requestDeletion']}
                  </button>
                </form>
              {/if}
            </section>
          </div>
        {/if}
      </div>
    </section>
  {:else}
    <section class="account-card hv-panel hv-stack" aria-labelledby="account-title">
      <header class="hv-page-header">
        <p class="eyebrow hv-eyebrow">{data.copy['site.name']}</p>
        <h1 class="hv-page-title" id="account-title">{data.copy['account.title']}</h1>
        <p class="intro hv-meta">{data.copy['account.intro']}</p>
      </header>

      {#if errorCode && errorCode !== 'unavailable'}
        <p class="message error hv-notice" data-tone="error" role="alert">
          {errorCode === 'email_required'
            ? data.copy['account.emailRequired']
            : errorCode === 'email_invalid'
              ? data.copy['account.emailInvalid']
              : errorCode === 'denied'
                ? data.copy['account.consentDenied']
                : errorCode === 'link_invalid'
                  ? data.copy['account.linkInvalid']
                  : errorCode === 'session_expired'
                    ? data.copy['account.sessionExpired']
                    : errorCode === 'configuration_conflict'
                      ? data.copy['account.configurationConflict']
                      : errorCode === 'provider_failed'
                        ? data.copy['account.providerFailed']
                        : data.copy['account.authUnavailable']}
        </p>
      {/if}

      {#if successCode === 'link_sent'}
        <p class="message success hv-notice" data-tone="success" role="status">
          {data.copy['account.linkSent']}
        </p>
      {/if}

      {#if data.providers.facebook}
        <form method="POST" action="?/facebook">
          <input type="hidden" name="returnTo" value={form?.returnTo ?? data.returnTo} />
          <button class="facebook hv-control" type="submit">
            <span aria-hidden="true">f</span>{data.copy['account.facebook']}
          </button>
        </form>
        <p class="privacy">{data.copy['account.facebookPrivacy']}</p>
      {/if}

      {#if data.providers.facebook && data.providers.email}
        <p class="divider"><span>{data.copy['account.orEmail']}</span></p>
      {/if}

      {#if data.providers.email}
        <form method="POST" action="?/email" use:enhance={enhanceAction} class="email-form">
          <label for="member-email">{data.copy['account.emailLabel']}</label>
          <input
            id="member-email"
            name="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            placeholder={data.copy['account.emailPlaceholder']}
            value={emailValue}
            class="hv-field"
            required
          />
          <input type="hidden" name="returnTo" value={form?.returnTo ?? data.returnTo} />
          <button class="hv-control" data-intent="primary" type="submit" disabled={submitting}>
            {data.copy['account.sendLink']}
          </button>
        </form>
        <p class="privacy">{data.copy['account.privacy']}</p>
      {:else if !data.providers.facebook}
        <p class="quiet-status hv-notice" data-tone="info" role="status">
          {data.copy['account.authUnavailable']}
        </p>
      {/if}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a class="back-link hv-control" href={data.returnTo}>{data.copy['account.backToPlace']}</a>
    </section>
  {/if}
</main>

<style>
  .account-shell {
    display: grid;
    min-height: calc(100vh - 5.5rem);
    place-items: start center;
  }

  .account-card {
    width: min(100%, 35rem);
    padding: clamp(1.4rem, 5vw, 2.5rem);
  }

  .account-card.signed-in {
    width: min(100%, 42rem);
  }

  .eyebrow {
    margin: 0;
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.2rem;
  }

  .intro {
    max-width: 46ch;
  }

  form,
  .email-form {
    display: grid;
    gap: 0.6rem;
  }

  label,
  dt {
    font-weight: 850;
  }

  input {
    padding: 0.7rem 0.9rem;
  }

  button,
  .back-link {
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .facebook {
    grid-template-columns: auto 1fr;
    align-items: center;
    background: #1877f2;
    color: white;
  }

  .facebook span {
    font-size: 1.35rem;
  }

  .secondary,
  .back-link {
    border-color: var(--hv-color-fjord);
    color: var(--hv-color-fjord);
  }

  .danger {
    border-color: var(--hv-color-danger);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-danger);
  }

  .divider {
    display: flex;
    margin: 1.4rem 0;
    align-items: center;
    gap: 0.8rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.85rem;
    text-align: center;
  }

  .divider::before,
  .divider::after {
    height: 1px;
    flex: 1;
    background: var(--hv-border-subtle);
    content: '';
  }

  .message,
  .quiet-status {
    margin: 0;
    font-weight: 700;
    line-height: 1.45;
  }

  .quiet-status,
  .privacy {
    color: var(--hv-color-basalt-muted);
    font-size: 0.88rem;
  }

  .privacy {
    margin: 1rem 0 1.35rem;
    line-height: 1.4;
  }

  dl {
    display: grid;
    margin: 0;
    gap: 0.9rem;
  }

  dl div {
    display: grid;
    grid-template-columns: minmax(8rem, 0.45fr) 1fr;
    gap: 0.8rem;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .account-home {
    align-items: stretch;
  }

  .account-destination {
    display: grid;
    align-content: start;
  }

  .account-destination.contributions {
    grid-column: 1 / -1;
  }

  .account-destination.moderation {
    grid-column: 1 / -1;
    background: var(--hv-color-fjord-soft);
  }

  .account-destination h2,
  .account-destination p {
    margin: 0;
  }

  .account-destination p {
    margin-top: 0.35rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.45;
  }

  .account-destination > a,
  .destination-links a {
    margin-top: 0.8rem;
  }

  .discovery-link {
    display: inline-flex;
    justify-self: start;
  }

  .settings {
    border-top: 1px solid var(--hv-border-subtle);
    padding-top: 1rem;
  }

  .settings-toggle {
    width: fit-content;
    min-height: 0;
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--hv-color-fjord);
    font-weight: 900;
    cursor: pointer;
    text-decoration: underline;
  }

  .settings-toggle:focus-visible {
    border-radius: var(--hv-radius-control);
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }

  .settings-body {
    margin-top: 0.8rem;
  }

  .deletion p {
    color: var(--hv-color-basalt-muted);
    line-height: 1.5;
  }

  @media (max-width: 32rem) {
    .account-card {
      padding: 1.35rem;
    }

    dl div {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }

    .account-destination.contributions {
      grid-column: auto;
    }

    .account-destination.moderation {
      grid-column: auto;
    }
  }
</style>
