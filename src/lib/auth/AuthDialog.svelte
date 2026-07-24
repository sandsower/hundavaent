<script lang="ts">
  import { resolve } from '$app/paths';
  import { afterNavigate, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  import type { Catalogue, Locale } from '$i18n';
  import { postHogAnalytics } from '$lib/analytics/posthog';
  import { passwordlessResendCooldownSeconds } from '$lib/auth/resend';
  import { authRequestEventName, isAuthRequest, type AuthRequest } from '$lib/auth/controller';

  interface Props {
    lang: Locale;
    copy: Catalogue;
    providers: { email: boolean; facebook: boolean };
    initialRequest?: AuthRequest | null;
  }

  let { lang, copy, providers, initialRequest = null }: Props = $props();
  let dialog: HTMLDialogElement;
  let request = $state<AuthRequest>({ origin: 'header' });
  let email = $state('');
  let sent = $state(false);
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let resendSeconds = $state(0);
  let resendTimer: ReturnType<typeof setInterval> | undefined;

  const title = $derived(
    request.intent?.action === 'favourite' && request.intent.placeName
      ? copy['auth.favouriteTitle'].replace('{name}', request.intent.placeName)
      : request.intent?.action === 'rating'
        ? copy['auth.ratingTitle'].replace('{name}', request.intent.placeName)
        : copy['auth.continue']
  );

  afterNavigate(() => {
    queueMicrotask(openFromCurrentUrl);
  });

  onMount(() => {
    const receiveRequest = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isAuthRequest(detail)) open(detail);
    };
    window.addEventListener(authRequestEventName, receiveRequest);

    openFromCurrentUrl();

    return () => {
      window.removeEventListener(authRequestEventName, receiveRequest);
      stopResendTimer();
    };
  });

  function openFromCurrentUrl(): void {
    if (typeof window === 'undefined' || !dialog || dialog.open) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('auth') !== 'open') return;

    open(initialRequest ?? fallbackRequest(url) ?? { origin: 'header' });
    const status = url.searchParams.get('authStatus');
    if (status === 'denied' || status === 'provider_failed') error = copy['auth.facebookFailed'];
    // 'unavailable' is a configuration state, not a failed attempt; the provider
    // notice in the dialog body already explains it without alarming the visitor.
    else if (status && status !== 'unavailable') error = copy['auth.failed'];
  }

  function open(nextRequest: AuthRequest): void {
    request = nextRequest;
    sent = false;
    error = null;
    postHogAnalytics.capture('auth modal opened', { origin: nextRequest.origin });
    if (!dialog.open) dialog.showModal();
  }

  function close(): void {
    dialog.close();
  }

  function handleClosed(): void {
    stopResendTimer();
    clearTransientAuthParameters();
  }

  function clearTransientAuthParameters(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    for (const name of [
      'auth',
      'authStatus',
      'authReturnTo',
      'authResult',
      'authMethod',
      'pendingAction',
      'pendingResult',
      'pendingIntent',
      'authIntent',
      'authPlace'
    ]) {
      url.searchParams.delete(name);
    }
    const cleanedUrl = `${url.pathname}${url.search}${url.hash}` as `/${string}`;
    replaceState(resolve(cleanedUrl), page.state);
  }

  function formData(method: 'email' | 'facebook'): FormData {
    const data = new FormData();
    const returnUrl = new URL(window.location.href);
    const requestedReturnTo = returnUrl.searchParams.get('authReturnTo');
    for (const name of [
      'auth',
      'authStatus',
      'authReturnTo',
      'pendingIntent',
      'authIntent',
      'authPlace'
    ]) {
      returnUrl.searchParams.delete(name);
    }
    data.set('method', method);
    data.set(
      'returnTo',
      requestedReturnTo ?? `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`
    );
    if (method === 'email') data.set('email', email);
    if (request.intent) {
      data.set('intentAction', request.intent.action);
      data.set('placeId', request.intent.placeId);
      if (request.intent.action === 'rating') {
        data.set('overallRating', String(request.intent.overallRating));
      }
    }
    if (request.continuationToken) data.set('pendingIntentToken', request.continuationToken);
    return data;
  }

  async function continueWith(method: 'email' | 'facebook'): Promise<void> {
    if (submitting) return;
    submitting = true;
    error = null;
    postHogAnalytics.capture('auth method selected', { method, origin: request.origin });

    try {
      const response = await fetch(resolve('/[lang=lang]/auth/start', { lang }), {
        method: 'POST',
        body: formData(method)
      });
      const result = (await response.json()) as {
        status?: string;
        url?: string;
        resendAfterSeconds?: number;
      };
      if (!response.ok) throw new Error('Authentication unavailable');

      if (method === 'facebook' && result.status === 'redirect' && result.url) {
        window.location.assign(result.url);
        return;
      }

      if (method === 'email' && result.status === 'link_sent') {
        sent = true;
        postHogAnalytics.capture('auth link requested', { origin: request.origin });
        startResendTimer(result.resendAfterSeconds ?? passwordlessResendCooldownSeconds);
        return;
      }

      throw new Error('Unexpected authentication response');
    } catch {
      error = method === 'facebook' ? copy['auth.facebookFailed'] : copy['auth.failed'];
      postHogAnalytics.capture('auth completed', { method, outcome: 'failed' });
    } finally {
      submitting = false;
    }
  }

  function startResendTimer(seconds: number): void {
    stopResendTimer();
    resendSeconds = seconds;
    resendTimer = setInterval(() => {
      resendSeconds -= 1;
      if (resendSeconds <= 0) stopResendTimer();
    }, 1000);
  }

  function stopResendTimer(): void {
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = undefined;
  }

  function useDifferentEmail(): void {
    sent = false;
    error = null;
    stopResendTimer();
    queueMicrotask(() => dialog.querySelector<HTMLInputElement>('input[type="email"]')?.focus());
  }

  function fallbackRequest(url: URL): AuthRequest | null {
    if (url.searchParams.get('authIntent') !== 'favourite') return null;
    const placeId = url.searchParams.get('authPlace');
    if (!placeId) return null;
    return { origin: 'favourite', intent: { action: 'favourite', placeId } };
  }
</script>

<dialog
  bind:this={dialog}
  class="auth-dialog"
  data-ui-mode="place"
  aria-labelledby="auth-dialog-title"
  onclose={handleClosed}
>
  <button class="close" type="button" aria-label={copy['auth.close']} onclick={close}>
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  </button>

  {#if sent}
    <div class="dialog-content sent-state">
      <p class="eyebrow">{copy['site.name']}</p>
      <h2 id="auth-dialog-title">{copy['auth.checkEmail']}</h2>
      <p>{copy['auth.sentTo'].replace('{email}', email)}</p>
      <div class="sent-actions">
        <button type="button" class="text-action" onclick={useDifferentEmail}>
          {copy['auth.differentEmail']}
        </button>
        <button
          type="button"
          class="text-action"
          disabled={resendSeconds > 0 || submitting}
          onclick={() => continueWith('email')}
        >
          {resendSeconds > 0
            ? copy['auth.sendAgainIn'].replace('{seconds}', String(resendSeconds))
            : copy['auth.sendAgain']}
        </button>
      </div>
    </div>
  {:else}
    <div class="dialog-content">
      <p class="eyebrow">{copy['site.name']}</p>
      <h2 id="auth-dialog-title">{title}</h2>
      <p class="benefits">{copy['auth.benefits']}</p>

      {#if error}
        <p class="error hv-notice" data-tone="error" role="alert">{error}</p>
      {/if}

      {#if providers.facebook}
        <button
          class="facebook hv-control"
          type="button"
          disabled={submitting}
          onclick={() => continueWith('facebook')}
        >
          <span aria-hidden="true">f</span>{copy['account.facebook']}
        </button>
      {/if}

      {#if providers.facebook && providers.email}
        <p class="divider"><span>{copy['auth.or']}</span></p>
      {/if}

      {#if providers.email}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void continueWith('email');
          }}
        >
          <label for="auth-email">{copy['account.emailLabel']}</label>
          <input
            id="auth-email"
            class="hv-field"
            type="email"
            bind:value={email}
            autocomplete="email"
            inputmode="email"
            required
          />
          <p class="passwordless">{copy['auth.noPassword']}</p>
          <button class="hv-control" data-intent="primary" type="submit" disabled={submitting}>
            {copy['auth.sendLink']}
          </button>
        </form>
      {/if}

      {#if !providers.email && !providers.facebook}
        <p class="hv-notice" data-tone="info">{copy['account.authUnavailable']}</p>
      {/if}

      <p class="legal">
        {copy['auth.legalPrefix']}
        <a href={resolve('/[lang=lang]/terms', { lang })}>{copy['auth.termsLink']}</a>
        {copy['auth.legalJoin']}
        <a href={resolve('/[lang=lang]/privacy', { lang })}>{copy['auth.privacyLink']}</a>.
      </p>
    </div>
  {/if}
</dialog>

<style>
  .auth-dialog {
    width: min(calc(100% - 2rem), 29rem);
    max-height: min(44rem, calc(100dvh - 2rem));
    margin: auto;
    padding: 0;
    overflow: auto;
    border: 1px solid var(--hv-border-subtle);
    border-radius: 1.25rem;
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    box-shadow: var(--hv-shadow-raised);
  }

  .auth-dialog::backdrop {
    background: rgb(20 25 24 / 42%);
    backdrop-filter: blur(2px);
  }

  .dialog-content {
    display: grid;
    gap: 1rem;
    padding: 1rem;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    padding-right: 2rem;
    font-family: var(--hv-font-display);
    font-size: clamp(1.65rem, 5vw, 2rem);
    line-height: 1.05;
  }

  .eyebrow {
    color: var(--hv-color-fjord);
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .benefits,
  .sent-state > p:not(.eyebrow) {
    color: var(--hv-color-basalt-muted);
    line-height: 1.55;
  }

  .close {
    position: absolute;
    z-index: 1;
    top: 0.85rem;
    right: 0.85rem;
    display: grid;
    width: 2.4rem;
    height: 2.4rem;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
    place-items: center;
  }

  .close:hover {
    background: var(--hv-color-fjord-soft);
  }

  .close:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 2px;
  }

  .close svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-width: 1.8;
  }

  form {
    display: grid;
    gap: 0.65rem;
  }

  label {
    font-weight: 850;
  }

  input {
    width: 100%;
    padding: 0.75rem 0.85rem;
  }

  .facebook {
    display: grid;
    width: 100%;
    min-height: var(--hv-control-height);
    padding: 0.625rem 0.85rem;
    border: 0;
    border-radius: var(--hv-radius-control);
    grid-template-columns: 1.2rem 1fr 1.2rem;
    background: #1877f2;
    color: white;
    font-weight: 800;
    line-height: 1.2;
    cursor: pointer;
  }

  .facebook span {
    font-size: 1.3rem;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .passwordless,
  .legal {
    color: var(--hv-color-basalt-muted);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .legal {
    margin-top: 0.15rem;
    text-align: center;
  }

  .legal a {
    color: inherit;
    font-weight: 750;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.8rem;
  }

  .divider::before,
  .divider::after {
    height: 1px;
    flex: 1;
    background: var(--hv-border-subtle);
    content: '';
  }

  .sent-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.1rem;
  }

  .text-action {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--hv-color-fjord);
    font: inherit;
    font-weight: 850;
    text-decoration: underline;
    cursor: pointer;
  }

  @media (max-width: 42rem) {
    .auth-dialog {
      right: 1rem;
      left: 1rem;
      width: auto;
      max-width: none;
      max-height: min(88dvh, 44rem);
      margin: auto 0 max(1rem, env(safe-area-inset-bottom));
      border-width: 1px;
      border-radius: 1.25rem;
    }

    .dialog-content {
      padding: 1rem 1rem max(1rem, env(safe-area-inset-bottom));
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .auth-dialog[open] {
      animation: dialog-in 180ms ease-out;
    }

    @keyframes dialog-in {
      from {
        opacity: 0;
        transform: translateY(0.4rem) scale(0.985);
      }
    }
  }
</style>
