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

<main class="account-shell">
  {#if data.member}
    <section class="account-card signed-in" aria-labelledby="account-title">
      <div class="paw-mark" aria-hidden="true">♥</div>
      <p class="eyebrow">{data.copy['site.name']}</p>
      <h1 id="account-title">{data.copy['account.signedInTitle']}</h1>
      <p class="intro">{data.copy['account.signedInIntro']}</p>

      {#if errorCode}
        <p class="message error" role="alert">
          {errorCode === 'authentication_required'
            ? data.copy['account.authenticationRequired']
            : data.copy['account.authUnavailable']}
        </p>
      {/if}

      {#if successCode === 'deletion_requested' || data.member.deletionStatus === 'requested'}
        <p class="message success" role="status">{data.copy['account.deletionRequested']}</p>
      {/if}

      <div class="account-home">
        <section class="account-destination" aria-labelledby="saved-heading">
          <h2 id="saved-heading">{data.copy['account.savedHeading']}</h2>
          <p>{data.copy['account.savedIntro']}</p>
          <a href={resolve('/[lang=lang]/saved', { lang: data.lang })}>
            {data.copy['favourite.savedLink']}
          </a>
        </section>

        <section class="account-destination" aria-labelledby="visits-heading">
          <h2 id="visits-heading">{data.copy['account.visitsHeading']}</h2>
          <p>{data.copy['account.visitsIntro']}</p>
          <a href={resolve('/[lang=lang]/history', { lang: data.lang })}>
            {data.copy['history.navLink']}
          </a>
        </section>

        <section class="account-destination contributions" aria-labelledby="contributions-heading">
          <h2 id="contributions-heading">{data.copy['account.contributionsHeading']}</h2>
          <p>{data.copy['account.contributionsIntro']}</p>
          <div class="destination-links">
            <a href={resolve('/[lang=lang]/suggest', { lang: data.lang })}>
              {data.copy['suggestion.nav']}
            </a>
            <a href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}>
              {data.copy['suggestion.myTitle']}
            </a>
            <a href={resolve('/[lang=lang]/account/contributor-status', { lang: data.lang })}>
              {data.copy['contributor.nav']}
            </a>
            <a href={resolve('/[lang=lang]/account/achievements', { lang: data.lang })}>
              {data.copy['achievements.nav']}
            </a>
          </div>
        </section>

        {#if data.canModerate}
          <section class="account-destination moderation" aria-labelledby="moderation-heading">
            <h2 id="moderation-heading">{data.copy['account.moderationHeading']}</h2>
            <p>{data.copy['account.moderationIntro']}</p>
            <a href={resolve('/[lang=lang]/moderation', { lang: data.lang })}>
              {data.copy['account.moderationLink']}
            </a>
          </section>
        {/if}
      </div>

      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a class="back-link discovery-link" href={data.returnTo}>{data.copy['account.backToPlace']}</a
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
          <div class="settings-body">
            <section class="identity" aria-labelledby="identity-heading">
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
              <button class="secondary" type="submit" disabled={submitting}
                >{data.copy['account.signOut']}</button
              >
            </form>

            <section class="deletion" aria-labelledby="deletion-heading">
              <h2 id="deletion-heading">{data.copy['account.deletionHeading']}</h2>
              <p>{data.copy['account.deletionExplanation']}</p>
              {#if data.member.deletionStatus !== 'requested'}
                <form method="POST" action="?/requestDeletion" use:enhance={enhanceAction}>
                  <button class="danger" type="submit" disabled={submitting}>
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
    <section class="account-card" aria-labelledby="account-title">
      <div class="paw-mark" aria-hidden="true">♥</div>
      <p class="eyebrow">{data.copy['site.name']}</p>
      <h1 id="account-title">{data.copy['account.title']}</h1>
      <p class="intro">{data.copy['account.intro']}</p>

      {#if errorCode && errorCode !== 'unavailable'}
        <p class="message error" role="alert">
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
        <p class="message success" role="status">{data.copy['account.linkSent']}</p>
      {/if}

      {#if data.providers.facebook}
        <form method="POST" action="?/facebook">
          <input type="hidden" name="returnTo" value={form?.returnTo ?? data.returnTo} />
          <button class="facebook" type="submit">
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
            required
          />
          <input type="hidden" name="returnTo" value={form?.returnTo ?? data.returnTo} />
          <button type="submit" disabled={submitting}>{data.copy['account.sendLink']}</button>
        </form>
        <p class="privacy">{data.copy['account.privacy']}</p>
      {:else if !data.providers.facebook}
        <p class="quiet-status" role="status">{data.copy['account.authUnavailable']}</p>
      {/if}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a class="back-link" href={data.returnTo}>{data.copy['account.backToPlace']}</a>
    </section>
  {/if}
</main>

<style>
  .account-shell {
    display: grid;
    min-height: calc(100vh - 5.5rem);
    place-items: start center;
    padding: clamp(1.25rem, 4vw, 3.5rem) 1rem 4rem;
  }
  .account-card {
    width: min(100%, 35rem);
    padding: clamp(1.5rem, 5vw, 3rem);
    border: 2px solid var(--ink);
    border-radius: 2rem 0.8rem 2rem 0.8rem;
    background: var(--paper-light);
    box-shadow: 0.75rem 0.75rem 0 var(--amber);
  }
  .account-card.signed-in {
    width: min(100%, 42rem);
    box-shadow: 0.75rem 0.75rem 0 var(--teal);
  }
  .paw-mark {
    display: grid;
    width: 3.3rem;
    height: 3.3rem;
    place-items: center;
    border-radius: 50% 45% 52% 42%;
    background: var(--coral);
    color: white;
    font-size: 1.4rem;
    transform: rotate(-6deg);
  }
  .eyebrow {
    margin: 1.2rem 0 0.35rem;
    color: var(--coral-dark);
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: clamp(2.3rem, 9vw, 4.2rem);
    line-height: 0.96;
    letter-spacing: -0.055em;
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.2rem;
  }
  .intro {
    max-width: 46ch;
    margin: 1rem 0 1.5rem;
    color: var(--ink-soft);
    line-height: 1.55;
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
    min-height: 3.2rem;
    padding: 0.7rem 0.9rem;
    border: 2px solid var(--ink);
    border-radius: 0.75rem;
    background: white;
    color: var(--ink);
  }
  button,
  .back-link {
    min-height: 3.1rem;
    padding: 0.7rem 1.15rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--teal);
    color: white;
    font-weight: 850;
    text-align: center;
    text-decoration: none;
    box-shadow: 0 0.25rem 0 var(--ink);
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
  }
  .facebook span {
    font-size: 1.35rem;
  }
  .secondary,
  .back-link {
    background: var(--sun);
    color: var(--ink);
  }
  .danger {
    background: transparent;
    color: var(--danger);
    box-shadow: none;
  }
  .divider {
    display: flex;
    margin: 1.4rem 0;
    align-items: center;
    gap: 0.8rem;
    color: var(--ink-soft);
    font-size: 0.85rem;
    text-align: center;
  }
  .divider::before,
  .divider::after {
    height: 2px;
    flex: 1;
    background: var(--paper-deep);
    content: '';
  }
  .message,
  .quiet-status {
    padding: 0.8rem 1rem;
    border-radius: 0.8rem;
    font-weight: 700;
    line-height: 1.45;
  }
  .error {
    border: 2px solid var(--danger);
    background: #ffe1d7;
    color: #78231c;
  }
  .success {
    border: 2px solid var(--success);
    background: #dff3e4;
    color: #195546;
  }
  .quiet-status,
  .privacy {
    color: var(--ink-soft);
    font-size: 0.88rem;
  }
  .quiet-status {
    background: var(--paper-deep);
  }
  .privacy {
    margin: 1rem 0 1.35rem;
    line-height: 1.4;
  }
  .identity,
  .deletion {
    padding: 1.2rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    background: white;
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
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 1.5rem;
    gap: 1rem;
  }
  .account-destination {
    display: grid;
    align-content: start;
    border: 2px solid var(--ink);
    border-radius: var(--radius-organic);
    background: white;
    padding: 1.1rem;
  }
  .account-destination.contributions {
    grid-column: 1 / -1;
  }
  .account-destination.moderation {
    grid-column: 1 / -1;
    background: var(--paper-deep);
  }
  .account-destination h2,
  .account-destination p {
    margin: 0;
  }
  .account-destination p {
    margin-top: 0.35rem;
    color: var(--ink-soft);
    line-height: 1.45;
  }
  .account-destination > a,
  .destination-links a {
    margin-top: 0.8rem;
    color: var(--coral-dark);
    font-weight: 850;
  }
  .destination-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1rem;
  }
  .discovery-link {
    display: inline-flex;
    margin-top: 1.2rem;
  }
  .settings {
    margin-top: 1.5rem;
    border-top: 1px solid rgb(25 59 69 / 28%);
    padding-top: 1rem;
  }
  .settings-toggle {
    width: fit-content;
    min-height: 0;
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--coral-dark);
    font-weight: 900;
    cursor: pointer;
    box-shadow: none;
    text-decoration: underline;
  }
  .settings-body {
    display: grid;
    gap: 1rem;
    margin-top: 0.8rem;
  }
  .deletion p {
    color: var(--ink-soft);
    line-height: 1.5;
  }
  @media (max-width: 32rem) {
    .account-card {
      padding: 1.35rem;
      box-shadow: 0.4rem 0.5rem 0 var(--amber);
    }
    dl div {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }
    .account-home {
      grid-template-columns: 1fr;
    }
    .account-destination.contributions {
      grid-column: auto;
    }
    .account-destination.moderation {
      grid-column: auto;
    }
  }
</style>
