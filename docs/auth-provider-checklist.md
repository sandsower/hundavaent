# identity-provider Identity Provider Configuration Checklist

This checklist contains configuration names and validation steps only.
Never paste provider secrets into Linear, source control, logs, screenshots, or client-visible environment values.

## Shared requirements

- Set `PUBLIC_APP_URL` to the exact public origin for each environment.
- Add `/<locale>/auth/callback` for Icelandic and English to the Supabase Auth redirect allowlist.
- Keep PKCE enabled, refresh-token rotation enabled, and refresh-token reuse detection configured.
- Keep email OTP single-use and set its expiry to 60 minutes or less.
- Set provider and email rate limits in Supabase before enabling either feature switch.
- Keep both provider switches disabled by default in every deployment.
- Do not enable Facebook and email together before cross-provider-linking approves cross-provider identity linking and a new versioned policy explicitly implements it.
- The current application deliberately rejects any environment that enables both providers.
- Apply the provider-policy migration before enabling sign-in and confirm its provider matches the one enabled deployment switch.
- The initial `member-single-provider-v1` tenant policy permits email only.
- Treat a provider change as a versioned policy migration, never as an environment-variable change alone.
- Confirm each sign-in initiation action resolves the persistent policy before contacting Supabase Auth.
- Confirm requesting but not consuming a link creates no application Member account or Member role.
- Generate a distinct high-entropy `MEMBER_ACTIVATION_SECRET` for every environment, store it only in the server secret store, and install the same value through the service-role-only database capability command.
- Rotate the application and database activation capability together before enabling Member sign-in.
- Confirm direct activation RPC calls with missing, invalid, Facebook, or multiple identities cannot create account, role, or audit state.
- The callback resolves provider configuration before and after token exchange and accepts only one server-returned identity matching the single enabled provider.
- Treat callback query parameters as navigation context only, never as proof of the authenticated provider.
- Confirm every callback recovery path expires all request-scoped Supabase auth-cookie chunks even when provider sign-out rejects or returns an error.
- Verify account and auth callback responses return `Cache-Control: private, no-store`.
- Verify production secrets exist only in Supabase or the deployment secret store.

## Facebook

- Create a dedicated Facebook application for Hundavænt.
- Configure separate development, preview, and production OAuth redirect URIs from Supabase.
- Request only the provider scopes required for sign-in.
  Hundavænt explicitly requests `email`; Facebook may include its mandatory basic scope.
- Configure the Facebook application ID and secret in Supabase Auth, never in browser variables.
- Complete Facebook data-use, privacy-policy, deletion-callback, and application-review requirements.
- Set `AUTH_FACEBOOK_ENABLED=true` only after a full sign-in, denied-consent, revoked-access, and sign-out test passes in that environment, with email disabled until cross-provider-linking is implemented.

## Passwordless email

- Configure a production SMTP provider and sender domain in Supabase Auth.
- Publish SPF, DKIM, and DMARC records for the sender domain.
- Localize the magic-link message and make the destination clearly identifiable as Hundavænt.
- Confirm delivery, expiry, single use, replay denial, same-device success, and other-device recovery behavior.
- Set `AUTH_EMAIL_ENABLED=true` only after delivery and abuse-rate tests pass, with Facebook disabled until cross-provider-linking is implemented.

## Privacy verification

- Inspect public HTML, JSON, metadata, analytics payloads, logs, and error responses for provider subject IDs, access tokens, avatars, names, or Facebook profile fields.
- Confirm the application Member table contains only the Auth user key and lifecycle timestamps.
- Confirm only the authenticated caller can execute account, role, auth-event, and deletion-request RPCs.
- Confirm Moderator users retain an ordinary private Member experience.
- Provision new Moderators through the atomic production command, and verify migration backfill covers every pre-existing active Moderator.

## External follow-ups

The real Facebook application and production email service require authorized provisioning.
Cross-provider linking/recovery and final account-deletion retention rules require explicit product and privacy approval before those behaviors are enabled.
