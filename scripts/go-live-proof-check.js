'use strict';

require('dotenv').config();

const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const { db, initDb } = require('../services/database');

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function toUrl(value) {
  try {
    return new URL(value);
  } catch (_) {
    return null;
  }
}

function requestStatus(url, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      { method: 'GET', timeout: timeoutMs },
      (res) => {
        resolve({ ok: true, statusCode: res.statusCode || 0 });
        res.resume();
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
    req.end();
  });
}

function hostFromBaseUrl(baseUrl) {
  const parsed = toUrl(baseUrl);
  return parsed ? parsed.hostname : '';
}

async function resolveHost(hostname) {
  if (!hostname) {
    return { ok: false, host: '', addresses: [], error: 'hostname vide' };
  }
  try {
    const [a, aaaa] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname)
    ]);
    const addresses = [];
    if (a.status === 'fulfilled') addresses.push(...a.value);
    if (aaaa.status === 'fulfilled') addresses.push(...aaaa.value);
    if (!addresses.length) {
      return { ok: false, host: hostname, addresses: [], error: 'aucune adresse A/AAAA' };
    }
    return { ok: true, host: hostname, addresses };
  } catch (err) {
    return { ok: false, host: hostname, addresses: [], error: err.message };
  }
}

async function dbEvidence() {
  await initDb();

  const latestPaidStmt = await db.prepare(`
    SELECT id, status, stripe_session_id, created_at
    FROM orders
    WHERE status IN ('paid', 'delivered')
    ORDER BY id DESC
    LIMIT 1
  `);
  const paidOrder = latestPaidStmt.get();

  if (!paidOrder) {
    return {
      hasPaidOrder: false,
      hasRealStripePayment: false,
      hasWebhookCorrelatedWorkflow: false,
      hasTokens: false,
      detail: 'Aucune commande paid/delivered trouvee'
    };
  }

  const workflowStmt = await db.prepare(`
    SELECT id, correlation_id, status, created_at
    FROM workflow_jobs
    WHERE type = 'order.finalize' AND correlation_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const workflow = workflowStmt.get(`stripe:${paidOrder.stripe_session_id || ''}`);

  const tokenStmt = await db.prepare(`
    SELECT COUNT(*) as c
    FROM download_tokens
    WHERE order_id = ?
  `);
  const tokenCount = tokenStmt.get(paidOrder.id)?.c || 0;

  return {
    hasPaidOrder: true,
    hasRealStripePayment: typeof paidOrder.stripe_session_id === 'string' && paidOrder.stripe_session_id.startsWith('cs_'),
    hasWebhookCorrelatedWorkflow: !!workflow,
    hasTokens: tokenCount > 0,
    paidOrder,
    workflow: workflow || null,
    tokenCount
  };
}

function printCheck(ok, label, detail) {
  const marker = ok ? 'PASS' : 'FAIL';
  console.log(`[${marker}] ${label}`);
  console.log(`       ${detail}`);
}

async function main() {
  const stableBaseUrl = env('GO_LIVE_STABLE_BASE_URL', 'https://www.skystores.org');
  const webhookPublicBase = env('STRIPE_WEBHOOK_PUBLIC_BASE_URL') || env('BASE_URL');
  const webhookUrl = webhookPublicBase
    ? `${webhookPublicBase.replace(/\/$/, '')}/api/webhook/stripe`
    : '';

  const stableHost = hostFromBaseUrl(stableBaseUrl);
  const configuredHost = hostFromBaseUrl(webhookPublicBase);
  const stableRootUrl = toUrl(stableBaseUrl);
  const stableWebhookUrl = toUrl(`${stableBaseUrl.replace(/\/$/, '')}/api/webhook/stripe`);

  const [dnsStable, dnsConfigured, stableRootProbe, stableWebhookProbe, evidence] = await Promise.all([
    resolveHost(stableHost),
    resolveHost(configuredHost),
    stableRootUrl ? requestStatus(stableRootUrl) : Promise.resolve({ ok: false, error: 'URL stable invalide' }),
    stableWebhookUrl ? requestStatus(stableWebhookUrl) : Promise.resolve({ ok: false, error: 'URL webhook stable invalide' }),
    dbEvidence()
  ]);

  console.log('Sky Store - GO-LIVE proof check');
  console.log(`Stable URL cible: ${stableBaseUrl}`);
  console.log(`Webhook configure: ${webhookUrl || '(absent)'}`);
  console.log('');

  printCheck(
    dnsStable.ok,
    'DNS stable resolvable',
    dnsStable.ok ? `${dnsStable.host} -> ${dnsStable.addresses.join(', ')}` : `${dnsStable.host}: ${dnsStable.error}`
  );

  printCheck(
    dnsConfigured.ok,
    'DNS host configure resolvable',
    dnsConfigured.ok
      ? `${dnsConfigured.host} -> ${dnsConfigured.addresses.join(', ')}`
      : `${dnsConfigured.host || '(absent)'}: ${dnsConfigured.error}`
  );

  printCheck(
    stableRootProbe.ok && stableRootProbe.statusCode >= 200 && stableRootProbe.statusCode < 500,
    'URL publique fonctionnelle',
    stableRootProbe.ok ? `HTTP ${stableRootProbe.statusCode}` : stableRootProbe.error
  );

  printCheck(
    stableWebhookProbe.ok && stableWebhookProbe.statusCode > 0,
    'Endpoint webhook accessible publiquement',
    stableWebhookProbe.ok ? `HTTP ${stableWebhookProbe.statusCode}` : stableWebhookProbe.error
  );

  printCheck(
    webhookUrl === `${stableBaseUrl.replace(/\/$/, '')}/api/webhook/stripe`,
    'Webhook configure sur domaine stable',
    webhookUrl || 'STRIPE_WEBHOOK_PUBLIC_BASE_URL/BASE_URL absent'
  );

  printCheck(
    evidence.hasPaidOrder && evidence.hasRealStripePayment,
    'Paiement E2E reel present en base',
    evidence.hasPaidOrder
      ? `order#${evidence.paidOrder.id} status=${evidence.paidOrder.status} session=${evidence.paidOrder.stripe_session_id || '(none)'}`
      : evidence.detail
  );

  printCheck(
    evidence.hasWebhookCorrelatedWorkflow,
    'Preuve webhook Stripe corrigee au workflow',
    evidence.hasWebhookCorrelatedWorkflow
      ? `workflow#${evidence.workflow.id} correlation=${evidence.workflow.correlation_id}`
      : 'Aucun workflow order.finalize correle stripe:<session_id>'
  );

  printCheck(
    evidence.hasTokens,
    'Commande finalisee avec artefacts',
    evidence.hasPaidOrder ? `download_tokens=${evidence.tokenCount}` : 'N/A'
  );

  const failed = [
    !dnsStable.ok,
    !dnsConfigured.ok,
    !(stableRootProbe.ok && stableRootProbe.statusCode >= 200 && stableRootProbe.statusCode < 500),
    !(stableWebhookProbe.ok && stableWebhookProbe.statusCode > 0),
    webhookUrl !== `${stableBaseUrl.replace(/\/$/, '')}/api/webhook/stripe`,
    !(evidence.hasPaidOrder && evidence.hasRealStripePayment),
    !evidence.hasWebhookCorrelatedWorkflow,
    !evidence.hasTokens
  ].some(Boolean);

  console.log('');
  if (failed) {
    console.log('PRET: NON (preuves incompletes)');
    process.exit(1);
  }
  console.log('PRET: OUI (4 preuves valides)');
  process.exit(0);
}

main().catch((err) => {
  console.error('[go-live-proof-check] Erreur fatale:', err && err.message ? err.message : err);
  process.exit(1);
});
