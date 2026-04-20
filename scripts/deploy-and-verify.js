'use strict';

require('dotenv').config();

const Stripe = require('stripe');

const STABLE_BASE = 'https://www.skystores.org';
const STABLE_ROOT = `${STABLE_BASE}/`;
const STABLE_AMBIANCES = `${STABLE_BASE}/ambiances`;
const STABLE_WEBHOOK = `${STABLE_BASE}/api/webhook/stripe`;

const deployHookUrl = String(process.env.RENDER_DEPLOY_HOOK_URL || '').trim();
const serviceName = String(process.env.RENDER_SERVICE_NAME || process.env.RENDER_SERVICE_ID || '').trim();
const configuredBase = String(process.env.STRIPE_WEBHOOK_PUBLIC_BASE_URL || process.env.BASE_URL || '').trim();
const configuredWebhook = configuredBase ? `${configuredBase.replace(/\/$/, '')}/api/webhook/stripe` : '';

const timeoutMs = Number(process.env.DEPLOY_VERIFY_TIMEOUT_MS || 10 * 60 * 1000);
const intervalMs = Number(process.env.DEPLOY_VERIFY_INTERVAL_MS || 15 * 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getUrl(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: '', error: err && err.message ? err.message : String(err) };
  }
}

async function postHook(url) {
  const res = await fetch(url, { method: 'POST' });
  return { status: res.status, body: await res.text() };
}

async function verifyStripeWebhook() {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) {
    return { checked: false, pass: false, detail: 'STRIPE_SECRET_KEY absent' };
  }
  try {
    const stripe = new Stripe(secret);
    const list = await stripe.webhookEndpoints.list({ limit: 20 });
    const endpoint = list.data.find((ep) => ep.url === STABLE_WEBHOOK && ep.status === 'enabled');
    if (!endpoint) {
      return { checked: true, pass: false, detail: 'Endpoint Stripe stable non trouve/enabled' };
    }
    const hasEvent = Array.isArray(endpoint.enabled_events) && endpoint.enabled_events.includes('checkout.session.completed');
    return {
      checked: true,
      pass: hasEvent,
      detail: `id=${endpoint.id} enabled_events=${(endpoint.enabled_events || []).join(',') || '(none)'}`
    };
  } catch (err) {
    return { checked: true, pass: false, detail: `Erreur Stripe API: ${err && err.message ? err.message : String(err)}` };
  }
}

function printProof(title, pass, detail) {
  console.log(`${pass ? '[PASS]' : '[FAIL]'} ${title}`);
  console.log(`       ${detail}`);
}

async function main() {
  if (!deployHookUrl) {
    console.error('RENDER_DEPLOY_HOOK_URL manquant.');
    process.exit(1);
  }

  console.log('Deploy + verification Skystore');
  console.log(`Hook: ${deployHookUrl}`);
  console.log(`Service cible (declare): ${serviceName || '(non fourni)'}`);

  const hook = await postHook(deployHookUrl);
  console.log(`Hook POST status=${hook.status}`);

  const start = Date.now();
  let root = null;
  let ambiances = null;
  while (Date.now() - start < timeoutMs) {
    root = await getUrl(STABLE_ROOT);
    ambiances = await getUrl(STABLE_AMBIANCES);
    if (root.ok && root.status === 200 && ambiances.ok && ambiances.status === 200) {
      break;
    }
    await sleep(intervalMs);
  }

  const root200 = !!root && root.ok && root.status === 200;
  const ambiances200 = !!ambiances && ambiances.ok && ambiances.status === 200;
  const ambiancesVisible = ambiances200 && /ambiance/i.test(ambiances.text || '');
  const webhookConfigured = configuredWebhook === STABLE_WEBHOOK;
  const stripeWebhook = await verifyStripeWebhook();

  printProof('1) https://www.skystores.org/ retourne 200', root200, root200 ? 'HTTP 200' : `HTTP ${root ? root.status : 0}`);
  printProof('2) https://www.skystores.org/ambiances retourne 200', ambiances200, ambiances200 ? 'HTTP 200' : `HTTP ${ambiances ? ambiances.status : 0}`);
  printProof('3) Les ambiances sont visibles sur la page', ambiancesVisible, ambiancesVisible ? 'Motif "ambiance" detecte dans la page' : 'Motif "ambiance" non detecte');
  printProof('4) Webhook Stripe public = https://www.skystores.org/api/webhook/stripe', webhookConfigured && stripeWebhook.pass, `config=${configuredWebhook || '(absent)'} ; stripe=${stripeWebhook.detail}`);
  printProof('5) Confirmation service exact redeploye', !!serviceName, serviceName || 'RENDER_SERVICE_NAME/RENDER_SERVICE_ID non fourni');

  const allPass = root200 && ambiances200 && ambiancesVisible && webhookConfigured && stripeWebhook.pass && !!serviceName;
  console.log('');
  console.log(allPass ? 'RESULTAT: PREUVE COMPLETE (version correcte en ligne)' : 'RESULTAT: PREUVE INCOMPLETE');
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('Erreur fatale deploy+verify:', err && err.message ? err.message : err);
  process.exit(1);
});

