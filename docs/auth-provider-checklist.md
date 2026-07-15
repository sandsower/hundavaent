# identity-provider Identity Provider Configuration Checklist

This checklist contains configuration names and validation steps only.
Never paste provider secrets into Linear, source control, logs, screenshots, or client-visible environment values.

## Shared requirements

- Set `PUBLIC_APP_URL` to the exact public origin for each environment.
- Add `/<locale>/auth/callback` for Icelandic and English to the Supabase Auth redirect allowlist.
- Keep PKCE enabled, refresh-token rotation enabled, and refresh-token reuse detection configured.
- Keep email OTP single-use and set its expiry to 60 minutes or less.
- Set provider and email rate limits in Supabase before enabling either feature switch.
- Keep both provider switches disabled by default until the environment passes this checklist.
- Apply `202607150032_auth_funnel.sql` before enabling sign-in.
- Confirm `get_member_provider_policy()` returns `member-linked-providers-v2`, both providers enabled, and verified-email automatic linking enabled.
- Enable Facebook and email together only after the Supabase project confirms automatic identity linking for the same verified email in both sign-in orders.
- Treat a provider-policy change as a versioned migration, never as an environment-variable change alone.
- Confirm each sign-in initiation action resolves the persistent policy before contacting Supabase Auth.
- Confirm requesting but not consuming a link creates no application Member account or Member role.
- Generate a distinct high-entropy `MEMBER_ACTIVATION_SECRET` for every environment, store it only in the server secret store, and install the same value through the service-role-only database capability command.
- Rotate the application and database activation capability together before enabling Member sign-in.
- Confirm direct activation RPC calls with missing, unverified, unsupported, or mismatched-email identities cannot create account, role, or audit state.
- Confirm one email identity, one Facebook identity with a verified email, and linked email plus Facebook identities can activate the same canonical Auth user.
- The callback resolves provider configuration before and after authentication and accepts only supported identities that include the method used for the callback.
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
- Set `AUTH_FACEBOOK_ENABLED=true` only after full sign-in, denied-consent, revoked-access, automatic-linking, and sign-out tests pass in that environment.

## Passwordless email

- Configure a production SMTP provider and sender domain in Supabase Auth.
- Publish SPF, DKIM, and DMARC records for the sender domain.
- Localize the magic-link message and make the destination clearly identifiable as Hundavænt.
- Configure the hosted Supabase magic-link template to send `token_hash={{ .TokenHash }}` and `type=email` to the allowlisted Hundavænt callback, matching `supabase/templates/magic-link.html`.
- Confirm delivery, expiry, single use, replay denial, same-device success, and other-device recovery behavior.
- Set `AUTH_EMAIL_ENABLED=true` only after delivery, token-hash callback, and abuse-rate tests pass.

## Pending actions and acquisition funnel

- Confirm Favorite and selected overall-rating intents contain only an opaque random token in the authentication redirect.
- Confirm pending intents expire after 30 minutes, are consumed once, and cannot be claimed by another Member.
- Confirm an expired, cancelled, or abandoned sign-in performs no Favorite or rating action.
- Confirm callback retries are idempotent.
- Confirm authentication analytics include origin, method, result, and pending-action outcome only.
- Confirm analytics never include email, Facebook profile fields, provider subject IDs, rating notes, or other personal content.
- Confirm the public Terms and Privacy Policy routes are live before Facebook review or production enablement.

## Privacy verification

- Inspect public HTML, JSON, metadata, analytics payloads, logs, and error responses for provider subject IDs, access tokens, avatars, names, or Facebook profile fields.
- Confirm the application Member table contains only the Auth user key and lifecycle timestamps.
- Confirm only the authenticated caller can execute account, role, auth-event, and deletion-request RPCs.
- Confirm Moderator users retain an ordinary private Member experience.
- Provision new Moderators through the atomic production command, and verify migration backfill covers every pre-existing active Moderator.

## External production prerequisites

- Provision the real Facebook application, configure its production OAuth callback in Supabase, and complete Meta application review.
- Provision production SMTP and publish SPF, DKIM, and DMARC.
- Install the hosted token-hash magic-link template because local repository configuration does not update a hosted Supabase project.
- Add both localized callback URLs to the hosted Supabase redirect allowlist.
- Set both deployment switches and rotate the environment-specific Member activation secret only after all checks above pass.
