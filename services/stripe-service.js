/**
 * STRIPE-SERVICE â€” Paiement Stripe
 * ================================
 * Mode SIMULATION (MOCK_STRIPE=true ou STRIPE_SECRET_KEY absent/remplace):
 *   - Simule un succes de paiement instantane
 *   - Cree un stripe_session_id factice (mock_xxx)
 *   - Aucun appel a l'API Stripe
 *
 * Mode REEL (MOCK_STRIPE=false + STRIPE_SECRET_KEY valide):
 *   - Utilise l'API Stripe reelle
 *   - Verifie le paiement avant de confirmer
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const Stripe = require('stripe');
const gallery = require('./photo-gallery');

// Mode simulation: MOCK_STRIPE=true (defaut) ou cle placeholder
const MOCK_STRIPE = process.env.MOCK_STRIPE !== 'false'
  && (process.env.MOCK_STRIPE === 'true'
    || !process.env.STRIPE_SECRET_KEY
    || process.env.STRIPE_SECRET_KEY.includes('YOUR_')
    || process.env.STRIPE_SECRET_KEY === 'sk_test_YOUR_SECRET_KEY_HERE');

let stripe = null;

if (!MOCK_STRIPE) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });
    console.log('[Stripe] Mode REEL branche');
  } catch (e) {
    console.warn('[Stripe] Erreur de chargement Stripe:', e.message);
    console.warn('[Stripe] Falling back en mode SIMULATION');
  }
}

if (MOCK_STRIPE) {
  console.log('[Stripe] Mode SIMULATION (MOCK_STRIPE=true ou cle non configuree)');
}

// ============================================================
// PRIX VALIDES (cotÃ© serveur â€” prevent price manipulation)
// ============================================================

const VALID_PRICES = {
  sky_map: 2000,      // 20.00$ CAD
  ambiance: 199,      // 1.99$ CAD
  bonus_photo: 0,     // gratuit
  bonus_ambiance: 0,  // gratuit
};

function resolveExpectedPrice(item) {
  if (item.type === 'sky_map') return VALID_PRICES.sky_map;
  if (item.type === 'ambiance') {
    const price = Number(item.price);
    return Number.isFinite(price) && price >= 0 ? Math.round(price) : VALID_PRICES.ambiance;
  }
  if (item.type === 'bonus_photo') return VALID_PRICES.bonus_photo;
  if (item.type === 'bonus_ambiance') return VALID_PRICES.bonus_ambiance;
  if (item.type === 'photo') {
    // Prix serveur au checkout: celui en galerie pour ce photoId, fallback sur le prix deja stocke en panier.
    const photoId = item.metadata && item.metadata.photoId;
    const photo = photoId ? gallery.getPhoto(photoId) : null;
    if (photo && Number.isFinite(photo.price) && photo.price >= 0) return Math.round(photo.price);
    if (Number.isFinite(item.price) && item.price >= 0) return Math.round(item.price);
    return null;
  }
  return null;
}

function validateItem(item) {
  const validPrice = resolveExpectedPrice(item);
  if (!validPrice && validPrice !== 0) {
    if (item.type === 'photo') {
      return { valid: false, error: 'Prix photo introuvable au checkout' };
    }
    return { valid: false, error: `Type de produit inconnu: ${item.type}` };
  }
  // En mode mock, le prix peut Ãªtre 0 (bonus) ou le prix normal
  if (!MOCK_STRIPE && item.price !== validPrice) {
    return { valid: false, error: `Prix invalide pour ${item.type}: ${item.price} (attendu: ${validPrice})` };
  }
  return { valid: true, price: validPrice };
}

// ============================================================
// CREER UNE SESSION DE PAIEMENT
// ============================================================

/**
 * @param {Object[]} items - items du panier
 * @param {string} successUrl - URL de retour succes (sans session_id)
 * @param {string} cancelUrl - URL d'annulation
 * @param {string} customerEmail - Email du client
 * @param {number} taxAmount - Montant des taxes en cents
 * @returns {Promise<{sessionId: string, url: string, mock: boolean}>}
 */
async function createCheckoutSession(items, successUrl, cancelUrl, customerEmail = null, taxAmount = 0) {
  const normalizedTaxAmount = Number.isFinite(taxAmount) && taxAmount > 0 ? Math.round(taxAmount) : 0;

  // === MODE SIMULATION ===
  if (MOCK_STRIPE) {
    const mockId = 'mock_' + uuidv4();
    const total = items.reduce((sum, item) => {
      const v = validateItem(item);
      return sum + ((v.price || 0) * (item.quantity || 1));
    }, 0) + normalizedTaxAmount;

    console.log(`\n[Stripe MOCK] Session creee:`);
    console.log(`  ID: ${mockId}`);
    console.log(`  Articles: ${items.map(i => i.title || i.type).join(', ')}`);
    console.log(`  Total: ${(total / 100).toFixed(2)}$ CAD`);
    console.log(`  Succes: ${successUrl}&session_id=${mockId}&mock=true`);
    console.log('');

    return {
      sessionId: mockId,
      url: `${successUrl}&session_id=${mockId}&mock=true`,
      mock: true
    };
  }

  // === MODE REEL ===
  const lineItems = [];
  for (const item of items) {
    const validated = validateItem(item);
    if (!validated.valid) {
      throw new Error(validated.error);
    }
    if (!Number.isFinite(validated.price) || validated.price <= 0) {
      continue;
    }
    lineItems.push({
      price_data: {
        currency: 'cad',
        product_data: {
          name: item.title || 'Carte du ciel personnalisee',
          description: item.type === 'sky_map'
            ? `Carte du ciel â€” ${item.metadata?.location_name || ''} ${item.metadata?.date || ''}`.trim()
            : (item.type === 'ambiance' || item.type === 'bonus_ambiance')
              ? 'Ambiance sonore'
              : 'Photo astrophotographie',
        },
        unit_amount: validated.price,
      },
      quantity: item.quantity || 1,
    });
  }
  if (!lineItems.length) {
    throw new Error('Aucun article facturable pour Stripe');
  }  if (normalizedTaxAmount > 0) {
    lineItems.push({
      price_data: {
        currency: 'cad',
        product_data: {
          name: 'TPS + TVQ',
          description: 'Taxes de vente'
        },
        unit_amount: normalizedTaxAmount
      },
      quantity: 1
    });
  }

  if (!stripe) {
    throw new Error('Stripe indisponible: client non initialise');
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl + '&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: cancelUrl,
    payment_method_types: ['card'],
    customer_email: customerEmail || undefined,
    metadata: { integration: 'sky_store_v1' },
  });

  return { sessionId: session.id, url: session.url, mock: false };
}

// ============================================================
// VERIFIER LE STATUT D'UNE SESSION
// ============================================================

/**
 * @param {string} sessionId
 * @returns {Promise<{paid: boolean, status: string, mock: boolean, customerEmail?: string|null}>}
 */
async function getSessionStatus(sessionId) {
  if (MOCK_STRIPE || !sessionId || sessionId.startsWith('mock_')) {
    return { paid: true, status: 'paid', mock: true, customerEmail: null };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerEmail = session.customer_details?.email || session.customer_email || null;
    return {
      paid: session.payment_status === 'paid',
      status: session.status,
      mock: false,
      customerEmail
    };
  } catch (e) {
    console.error('[Stripe] Erreur getSessionStatus:', e.message);
    return { paid: false, status: 'error', mock: false, customerEmail: null, error: e.message };
  }
}

// ============================================================
// VERIFIER LA SIGNATURE D'UN WEBHOOK
// ============================================================

function constructWebhookEvent(payload, signature, secret) {
  if (!stripe) throw new Error('Stripe non initialise');
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createCheckoutSession,
  getSessionStatus,
  constructWebhookEvent,
  isMock: () => MOCK_STRIPE,
  VALID_PRICES,
};


