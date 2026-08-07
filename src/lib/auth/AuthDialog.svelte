<script lang="ts">
  import { resolve } from '$app/paths';
  import { afterNavigate, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  import { Dialog, Button, Notice, Field, Input } from '@hundavaent/design-system';
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
  let dialogOpen = $state(false);
  // Bound to the form rather than the email input directly: Input now renders the native
  // <input> a component boundary deeper than this file can bind:this straight to, so
  // useDifferentEmail queries it off the form the same way the old dialog.querySelector did
  // before Dialog stopped exposing its own element. The queueMicrotask still runs after Svelte's
  // own state-driven DOM update, the same timing that reach relied on.
  let emailFormElement = $state<HTMLFormElement>();
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
        : request.origin === 'contribution'
          ? copy['auth.contributionTitle']
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
    if (typeof window === 'undefined' || dialogOpen) return;
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
    // Guarded exactly like the old dialog.open check: calling open() while already open must not
    // re-mount (and so not re-animate) the dialog - only the state above resets unconditionally.
    if (!dialogOpen) dialogOpen = true;
  }

  function close(): void {
    dialogOpen = false;
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
    // Scoped to the email input by type, not the form's first input of any kind: a future
    // hidden or auxiliary input inserted before the Field would silently steal this focus
    // target, and the old bind:this on the exact element could never miss.
    queueMicrotask(() =>
      emailFormElement?.querySelector<HTMLInputElement>('input[type="email"]')?.focus()
    );
  }

  function fallbackRequest(url: URL): AuthRequest | null {
    if (url.searchParams.get('authIntent') !== 'favourite') return null;
    const placeId = url.searchParams.get('authPlace');
    if (!placeId) return null;
    return { origin: 'favourite', intent: { action: 'favourite', placeId } };
  }
</script>

<Dialog
  bind:open={dialogOpen}
  labelledby="auth-dialog-title"
  class="auth-dialog"
  data-ui-mode="place"
  size="compact"
  unpadded
  onclose={handleClosed}
>
  <button
    class="close absolute top-[0.85rem] right-[0.85rem] z-1 grid size-[2.4rem] cursor-pointer place-items-center rounded-[50%] [border:0] bg-transparent text-inherit hover:bg-fjord-soft focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    type="button"
    aria-label={copy['auth.close']}
    onclick={close}
  >
    <svg
      class="size-[1.1rem] fill-none stroke-current [stroke-linecap:round] [stroke-width:1.8]"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  </button>

  {#if sent}
    <div
      class="dialog-content sent-state grid gap-4 p-4 max-narrow:pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <p class="eyebrow m-0 text-[0.78rem] font-[900] tracking-[0.08em] uppercase text-fjord">
        {copy['site.name']}
      </p>
      <h2
        id="auth-dialog-title"
        class="m-0 pr-8 font-display text-[clamp(1.65rem,5vw,2rem)] leading-[1.05]"
      >
        {copy['auth.checkEmail']}
      </h2>
      <p class="m-0 leading-[1.55] text-basalt-muted">
        {copy['auth.sentTo'].replace('{email}', email)}
      </p>
      <div class="sent-actions flex flex-wrap gap-x-[1.1rem] gap-y-3">
        <button
          type="button"
          class="text-action cursor-pointer [border:0] bg-transparent p-0 [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[850] text-fjord underline disabled:cursor-not-allowed disabled:opacity-60"
          onclick={useDifferentEmail}
        >
          {copy['auth.differentEmail']}
        </button>
        <button
          type="button"
          class="text-action cursor-pointer [border:0] bg-transparent p-0 [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[850] text-fjord underline disabled:cursor-not-allowed disabled:opacity-60"
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
    <div
      class="dialog-content grid gap-4 p-4 max-narrow:pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <p class="eyebrow m-0 text-[0.78rem] font-[900] tracking-[0.08em] uppercase text-fjord">
        {copy['site.name']}
      </p>
      <h2
        id="auth-dialog-title"
        class="m-0 pr-8 font-display text-[clamp(1.65rem,5vw,2rem)] leading-[1.05]"
      >
        {title}
      </h2>
      <p class="benefits m-0 leading-[1.55] text-basalt-muted">{copy['auth.benefits']}</p>

      {#if error}
        <Notice tone="error" as="p" role="alert" class="m-0">{error}</Notice>
      {/if}

      {#if providers.facebook}
        <Button
          class="facebook"
          type="button"
          disabled={submitting}
          onclick={() => continueWith('facebook')}
        >
          <span aria-hidden="true">f</span>{copy['account.facebook']}
        </Button>
      {/if}

      {#if providers.facebook && providers.email}
        <p
          class="divider flex items-center gap-3 m-0 text-[0.8rem] text-basalt-muted before:h-px before:flex-1 before:bg-border-subtle before:content-[''] after:h-px after:flex-1 after:bg-border-subtle after:content-['']"
        >
          <span>{copy['auth.or']}</span>
        </p>
      {/if}

      {#if providers.email}
        <form
          class="grid gap-actions"
          bind:this={emailFormElement}
          onsubmit={(event) => {
            event.preventDefault();
            void continueWith('email');
          }}
        >
          <Field label={copy['account.emailLabel']}>
            <Input
              type="email"
              bind:value={email}
              autocomplete="email"
              inputmode="email"
              required
            />
          </Field>
          <p class="passwordless m-0 text-[0.82rem] leading-[1.45] text-basalt-muted">
            {copy['auth.noPassword']}
          </p>
          <Button intent="primary" type="submit" disabled={submitting}>
            {copy['auth.sendLink']}
          </Button>
        </form>
      {/if}

      {#if !providers.email && !providers.facebook}
        <Notice tone="info" as="p" class="m-0">{copy['account.authUnavailable']}</Notice>
      {/if}

      <!-- The original .legal margin-top: 0.15rem never rendered: the more-specific
           .dialog-content paragraph reset won. Keep that rendered zero margin explicitly. -->
      <p class="legal m-0 text-center text-[0.82rem] leading-[1.45] text-basalt-muted">
        {copy['auth.legalPrefix']}
        <a class="font-[750] text-inherit" href={resolve('/[lang=lang]/terms', { lang })}
          >{copy['auth.termsLink']}</a
        >
        {copy['auth.legalJoin']}
        <a class="font-[750] text-inherit" href={resolve('/[lang=lang]/privacy', { lang })}
          >{copy['auth.privacyLink']}</a
        >.
      </p>
    </div>
  {/if}
</Dialog>

<style>
  /* Dialog owns the panel shell now (width/margin/padding, border, radius, background, shadow,
     ::backdrop, the [open] arrival animation, and the mobile bottom-sheet geometry) - see
     packages/design-system/src/lib/Dialog.svelte, whose own mobile-sheet rule reproduces the
     block that used to live here. Everything below styles .dialog-content and inward, which
     Dialog does not own and which tests/component/auth-dialog.browser.test.ts:147 pins. */

  /* Field renders its own <label>, crossing this component's scoping boundary the same way
     .facebook below crosses Button's - :global() reaches it purely on the literal element.
     Weight 850 is the one thing not approved to change in this migration: Field's label carries
     no weight utility of its own precisely so a surface like this keeps its heavier treatment. */
  form :global(label) {
    font-weight: 850;
  }

  /* Button renders its own <button> in a separate component, so Svelte's scoped CSS cannot reach
     it directly. Unlike .dialog-content below, .auth-dialog is not a locally-authored element -
     it is a class string handed to Dialog as a prop and landing on the <dialog> Dialog itself
     renders - so a partially-scoped ".auth-dialog :global(.facebook)" selector would require the
     scope hash Svelte adds to .auth-dialog, which that foreign <dialog> element never carries.
     The whole selector is wrapped in :global() instead, matching purely on the literal DOM
     classes (the pattern FavouriteControl.svelte's .favourite-toggle established, adapted for an
     ancestor that itself crosses a component boundary). Button's own hover lift / active squish
     now apply here too - the approved standard treatment - so no hover rule is restated on top of
     it. */
  :global(.auth-dialog .facebook) {
    display: grid;
    width: 100%;
    min-height: var(--hv-control-height);
    padding: 0.625rem 0.85rem;
    border: 0;
    border-radius: var(--hv-radius-control);
    grid-template-columns: 1.2rem 1fr 1.2rem;
    /* Facebook's darker press shade: white on brand #1877f2 is 4.23:1 and fails WCAG 1.4.3. */
    background: #166fe5;
    color: white;
    font-weight: 800;
    line-height: 1.2;
    cursor: pointer;
  }

  :global(.auth-dialog .facebook span) {
    font-size: 1.3rem;
  }
</style>
