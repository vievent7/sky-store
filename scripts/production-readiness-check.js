'use strict';

require('dotenv').config();

const PLACEHOLDER_MARKERS = ['YOUR_', 'CHANGE_ME', 'replace_me', 'placeholder', 'ROTATE_REQUIRED'];

function getEnv(name) {
  return String(process.env[name] || '').trim();
}

function hasPlaceholder(value) {
  if (!value) return true;
  return PLACEHOLDER_MARKERS.some(marker => value.includes(marker));
}

function isHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isTryCloudflare(value) {
  return /trycloudflare\.com/i.test(String(value || ''));
}

function pushResult(results, ok, label, detail, severity = 'error') {
  results.push({ ok, label, detail, severity });
}

function runChecks() {
  const results = [];
  const nodeEnv = getEnv('NODE_ENV') || 'development';
  const isProd = nodeEnv === 'production';
  const mockStripe = getEnv('MOCK_STRIPE').toLowerCase() !== 'false';
  const localWebhookMode = getEnv('STRIPE_LOCAL_WEBHOOK_MODE').toLowerCase() === 'true';
  const stripeSecretKey = getEnv('STRIPE_SECRET_KEY');
  const stripePublishableKey = getEnv('STRIPE_PUBLISHABLE_KEY');
  const stripeWebhookSecret = getEnv('STRIPE_WEBHOOK_SECRET');
  const sessionSecret = getEnv('SESSION_SECRET');
  const port = getEnv('PORT') || '3000';
  const baseUrl = getEnv('BASE_URL');
  const webhookPublicBaseUrl = getEnv('STRIPE_WEBHOOK_PUBLIC_BASE_URL') || baseUrl;
  const localWebhookBaseUrl = `http://localhost:${port}`;
  const effectiveWebhookBaseUrl = localWebhookMode ? localWebhookBaseUrl : webhookPublicBaseUrl;
  const sendgridApiKey = getEnv('SENDGRID_API_KEY');
  const smtpHost = getEnv('SMTP_HOST');

  pushResult(
    results,
    !!sessionSecret && !hasPlaceholder(sessionSecret) && sessionSecret.length >= 32,
    'SESSION_SECRET fort',
    sessionSecret ? `Longueur detectee: ${sessionSecret.length} caracteres` : 'SESSION_SECRET manquant'
  );

  pushResult(
    results,
    !!baseUrl && isHttpsUrl(baseUrl),
    'BASE_URL en HTTPS',
    baseUrl ? `BASE_URL=${baseUrl}` : 'BASE_URL manquant',
    isProd ? 'error' : 'warn'
  );

  if (localWebhookMode) {
    pushResult(results, true, 'Webhook local Stripe CLI actif', `Forward cible: ${localWebhookBaseUrl}/api/webhook/stripe`, 'warn');
  } else {
    pushResult(
      results,
      !!webhookPublicBaseUrl && isHttpsUrl(webhookPublicBaseUrl),
      'Base URL publique webhook definie',
      `STRIPE_WEBHOOK_PUBLIC_BASE_URL=${webhookPublicBaseUrl || '(absent)'}`,
      mockStripe ? 'warn' : 'error'
    );
  }

  if (!mockStripe) {
    pushResult(
      results,
      !hasPlaceholder(stripeSecretKey) && stripeSecretKey.startsWith('sk_test_'),
      'Stripe secret key test valide (mode test reel)',
      stripeSecretKey ? 'STRIPE_SECRET_KEY configuree' : 'STRIPE_SECRET_KEY manquante'
    );
    pushResult(
      results,
      !hasPlaceholder(stripePublishableKey) && stripePublishableKey.startsWith('pk_test_'),
      'Stripe publishable key test valide (mode test reel)',
      stripePublishableKey ? 'STRIPE_PUBLISHABLE_KEY configuree' : 'STRIPE_PUBLISHABLE_KEY manquante'
    );
    pushResult(
      results,
      !hasPlaceholder(stripeWebhookSecret) && stripeWebhookSecret.startsWith('whsec_'),
      'Webhook secret Stripe valide',
      stripeWebhookSecret ? 'STRIPE_WEBHOOK_SECRET configure' : 'STRIPE_WEBHOOK_SECRET manquant'
    );
  } else {
    pushResult(results, true, 'Mode Stripe', 'MOCK_STRIPE=true (simulation active)', 'warn');
  }

  pushResult(
    results,
    !!sendgridApiKey || !!smtpHost,
    'Provider email configure',
    sendgridApiKey ? 'SendGrid actif' : (smtpHost ? 'SMTP actif' : 'Aucun provider configure'),
    isProd ? 'error' : 'warn'
  );

  if (localWebhookMode) {
    pushResult(results, true, 'Webhook URL stable (mode local)', 'Mode local Stripe CLI: aucune dependance trycloudflare', 'warn');
  } else {
    pushResult(
      results,
      !isTryCloudflare(webhookPublicBaseUrl),
      'Webhook URL stable (non-trycloudflare)',
      webhookPublicBaseUrl ? webhookPublicBaseUrl : 'URL webhook indisponible',
      mockStripe ? 'warn' : 'error'
    );
  }

  return {
    nodeEnv,
    mockStripe,
    localWebhookMode,
    results,
    webhookUrl: effectiveWebhookBaseUrl ? `${effectiveWebhookBaseUrl.replace(/\/$/, '')}/api/webhook/stripe` : ''
  };
}

function formatAndExit(report) {
  const statusIcon = (ok, severity) => ok ? 'PASS' : (severity === 'warn' ? 'WARN' : 'FAIL');

  console.log('Sky Store - Production readiness check');
  console.log(`NODE_ENV=${report.nodeEnv}`);
  console.log(`MOCK_STRIPE=${report.mockStripe}`);
  console.log(`STRIPE_LOCAL_WEBHOOK_MODE=${report.localWebhookMode}`);
  if (report.webhookUrl) console.log(`Webhook attendu: ${report.webhookUrl}`);
  console.log('');

  let hasError = false;
  for (const item of report.results) {
    const icon = statusIcon(item.ok, item.severity);
    console.log(`[${icon}] ${item.label}`);
    console.log(`       ${item.detail}`);
    if (!item.ok && item.severity !== 'warn') hasError = true;
  }

  console.log('');
  if (hasError) {
    console.log('GO/NO-GO: NO-GO (bloqueurs detectes)');
    process.exit(1);
  }
  console.log('GO/NO-GO: GO (aucun bloqueur critique)');
  process.exit(0);
}

formatAndExit(runChecks());
