# Sky Store - Security + Production Readiness

## Fixed in this pass

- Stripe key examples now use explicit rotation placeholders (`ROTATE_REQUIRED_*`) instead of key-like values.
- Added explicit "no plaintext secrets in tickets/comments" guardrails in docs.
- Added `STRIPE_WEBHOOK_PUBLIC_BASE_URL` for webhook configuration decoupled from `BASE_URL`.
- Updated startup script to write `STRIPE_WEBHOOK_PUBLIC_BASE_URL` (not `BASE_URL`) during test tunnel workflows.
- Added automated readiness command:
  - `npm run check:production-readiness`
  - validates secret hygiene, webhook config, email provider readiness, and stable webhook URL.

## Remaining before production GO

- Replace Stripe placeholders with live production credentials in secure secret storage.
- Set `MOCK_STRIPE=false` in production.
- Set `STRIPE_WEBHOOK_PUBLIC_BASE_URL` to a stable HTTPS domain (named tunnel or fixed domain).
- Configure Stripe webhook endpoint `${STRIPE_WEBHOOK_PUBLIC_BASE_URL}/api/webhook/stripe` for `checkout.session.completed`.
- Configure real email provider (`SENDGRID_API_KEY` or `SMTP_*`) and validate delivery.
- Ensure `SESSION_SECRET` is 32+ chars and rotated from any previously exposed value.
- Run and pass `npm run check:production-readiness` in production env.

## Go / No-Go criteria

### GO
- Readiness check returns `GO/NO-GO: GO`.
- Stripe test payment + webhook completion verified end-to-end on stable webhook URL.
- Email confirmation and order receipt delivered through real provider.
- Rollback documented (re-enable `MOCK_STRIPE=true`, pause Stripe endpoint, and restore prior config snapshot).

### NO-GO
- Any readiness check `FAIL`.
- Webhook still depends on ephemeral `trycloudflare.com` URL.
- Any secret remains placeholder, exposed, or shared in plain text channels.
