/**
 * Orders â€” Commandes, Stripe, generation, telechargement
 * =====================================================
 */

// Retire le filigrane "SKY STORE" du HTML genere par buildCardHtml (final-preview.html)
// Le grand filigrane diagonal + le petit "Sky Store" en bas-droite
function stripWatermark(html) {
  // Grand filigrane diagonal SKY STORE â€” le div interieur avec le texte
  html = html.replace(/<div style="[^"]*text-shadow:0 2px 12px rgba\(0,0,0,\.5\)">SKY STORE<\/div><\/div><\/div>/g, '');
  // Petit "Sky Store" en bas-droite â€” text-shadow rgba(0,0,0,0.65) pas .4
  html = html.replace(/<div style="[^"]*text-shadow:0 1px 4px rgba\(0,0,0,0\.65\)">Sky Store<\/div>/g, '');
  return html;
}

// Convertit les chemins d'images absolus (/images-astro/...) en data URLs base64
// pour que le HTML soit autonome quand il est ouvert depuis le disque
function embedBackgroundImages(html) {
  const PUBLIC_PATH = path.join(__dirname, '..', 'public');
  return html.replace(/background:url\(([^)]+)\)/g, function(match, url) {
    if (url.startsWith('data:') || url.startsWith('http')) return match;
    // Chemin serveur : /images-astro/xxx -> public/images-astro/xxx
    const filePath = path.join(PUBLIC_PATH, url.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) {
      console.log('[embedBackgroundImages] Fichier non trouve:', filePath);
      return match; // garder l'URL originale
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    const mime = mimeTypes[ext] || 'image/jpeg';
    const base64 = fs.readFileSync(filePath).toString('base64');
    return 'background:url(data:' + mime + ';base64,' + base64 + ')';
  });
}

'use strict';

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { db } = require('../services/database');
const { getCartDb } = require('./cart');
const { createCheckoutSession, getSessionStatus, VALID_PRICES } = require('../services/stripe-service');
const { captureCardPngFromHtml } = require('../services/html-screenshot');
const { sendEmail, orderConfirmationEmail } = require('../services/email-service');
const gallery = require('../services/photo-gallery');
const {
  calculateAmbiancePriceDistribution,
  extractAmbianceKeyFromMetadata,
  selectBonusAmbiances
} = require('../services/ambiance-pricing');
const { renderSkyMap } = require('../services/sky-map-gen');
const { getSkyData } = require('../services/astro-engine');
const workflowRuntime = require('../services/workflow-runtime');
const { DEFAULT_TENANT_ID } = require('../services/tenant-context');

const TAX_RATE = 0.14975;
const FINALIZE_WORKFLOW_TYPE = 'order.finalize';
let finalizeWorkflowRegistered = false;

function registerFinalizeWorkflow() {
  if (finalizeWorkflowRegistered) return;
  workflowRuntime.registerHandler(FINALIZE_WORKFLOW_TYPE, async (payload, context) => {
    await finalizeOrder(payload.orderId, payload.userId);
    return {
      orderId: payload.orderId,
      tenantId: payload.tenantId,
      correlationId: context.correlationId
    };
  });
  finalizeWorkflowRegistered = true;
}

async function runFinalizeOrderWorkflow({ orderId, userId, tenantId, correlationId, source }) {
  registerFinalizeWorkflow();
  return workflowRuntime.enqueueAndRun({
    type: FINALIZE_WORKFLOW_TYPE,
    tenantId: tenantId || DEFAULT_TENANT_ID,
    correlationId: correlationId || '',
    maxAttempts: 2,
    payload: {
      orderId,
      userId,
      tenantId: tenantId || DEFAULT_TENANT_ID,
      source: source || 'unknown'
    }
  });
}

function isLegacySkyMapItem(meta) {
  return !meta.privateFilePath && !meta.previewFilePath && !meta.cardPreviewId;
}

function resolveCanonicalCleanPath(meta, fallbackItemId, storagePath) {
  if (meta.privateFilePath && typeof meta.privateFilePath === 'string') {
    const marker = '/storage/private/';
    const idx = meta.privateFilePath.indexOf(marker);
    if (idx >= 0) {
      const fileName = path.basename(meta.privateFilePath.substring(idx + marker.length));
      if (fileName) return path.join(storagePath, 'private', fileName);
    }
  }
  const cardId = meta.cardPreviewId || ('card_' + fallbackItemId);
  return path.join(storagePath, 'private', cardId + '_clean.html');
}

function resolveFilePathFromMetadata(item, meta, storagePath) {
  const STORAGE_PATH = storagePath || path.join(__dirname, '..', 'storage');
  const PUBLIC_PATH = path.join(__dirname, '..', 'public');
  const AMBIANCE_PUBLIC_DIR = path.join(PUBLIC_PATH, 'images-gallery', 'card-backgrounds');
  const candidates = [
    meta.filePath,
    meta.downloadFilePath,
    meta.audioPath,
    meta.ambiancePath,
    meta.imagePath,
    meta.pdfPath
  ].filter(v => typeof v === 'string' && v.trim());

  const urlCandidates = [
    meta.backgroundImageUrl,
    meta.imageUrl,
    meta.thumbUrl,
    meta.url
  ].filter(v => typeof v === 'string' && v.trim());

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    if (candidate.startsWith('/storage/')) {
      const rel = candidate.replace(/^\/storage\/+/, '');
      const abs = path.join(STORAGE_PATH, rel);
      if (fs.existsSync(abs)) return abs;
    }
    if (candidate.startsWith('/')) {
      const rel = candidate.replace(/^\/+/, '');
      const abs = path.join(PUBLIC_PATH, rel);
      if (fs.existsSync(abs)) return abs;
    }
    const ambienceAbs = path.join(AMBIANCE_PUBLIC_DIR, candidate);
    if (fs.existsSync(ambienceAbs)) return ambienceAbs;
  }

  for (const u of urlCandidates) {
    if (!u.startsWith('/')) continue;
    const rel = u.replace(/^\/+/, '');
    const abs = path.join(PUBLIC_PATH, rel);
    if (fs.existsSync(abs)) return abs;
  }

  if ((item.product_type === 'ambiance' || item.product_type === 'bonus_ambiance') && typeof meta.ambianceId === 'string') {
    const byId = path.join(AMBIANCE_PUBLIC_DIR, meta.ambianceId);
    if (fs.existsSync(byId)) return byId;
  }
  return null;
}

function resolveExpectedItemPrice(item) {
  if (item.isBonus) return VALID_PRICES.bonus_photo;
  if (item.type === 'sky_map') return VALID_PRICES.sky_map;
  if (item.type === 'bonus_photo') return VALID_PRICES.bonus_photo;
  if (item.type === 'bonus_ambiance') return 0;
  if (item.type === 'ambiance') {
    const price = Number(item.price);
    return Number.isFinite(price) && price >= 0 ? Math.round(price) : 199;
  }
  if (item.type === 'photo') {
    const photoId = item.metadata && item.metadata.photoId;
    const photo = photoId ? gallery.getPhoto(photoId) : null;
    if (!photo || !Number.isFinite(photo.price) || photo.price < 0) return null;
    return Math.round(photo.price);
  }
  return null;
}

function normalizeAndValidateCheckoutItems(items) {
  const normalizedItems = [];
  const mismatches = [];

  for (const item of items) {
    const expectedPrice = resolveExpectedItemPrice(item);
    if (!Number.isFinite(expectedPrice)) {
      mismatches.push({
        type: item.type || 'unknown',
        received: Number(item.price),
        expected: null,
        reason: 'price_unresolvable'
      });
      continue;
    }

    const receivedPrice = Number(item.price);
    if (receivedPrice !== expectedPrice) {
      mismatches.push({
        type: item.type || 'unknown',
        received: Number.isFinite(receivedPrice) ? receivedPrice : null,
        expected: expectedPrice,
        reason: 'price_mismatch'
      });
    }

    normalizedItems.push({
      ...item,
      price: expectedPrice,
      quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
        ? Math.floor(Number(item.quantity))
        : 1
    });
  }

  return { normalizedItems, mismatches };
}

// ============================================================
// BUILD FULL CARD HTML (meme rendu que le client a valide)
// ============================================================

function buildFullCardHtml(title, subtitle, footerLine, style, orientation, svgDataUrl) {
  const ESC = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const STYLES = {
    dark:   { bg1:'#060c18', bg2:'#0a1628', txt:'#c8ddf5', sub:'#7a9cc0', shd:'rgba(0,0,0,0.65)', wmk:'rgba(255,255,255,0.12)' },
    light:  { bg1:'#faf8f2', bg2:'#ede8da', txt:'#1a1a2e', sub:'#4a4a6a', shd:'rgba(0,0,0,0.18)', wmk:'rgba(0,0,0,0.10)' },
    art:    { bg1:'#0d1830', bg2:'#1a0a2e', txt:'#e8d5ff', sub:'#b8a0d0', shd:'rgba(0,0,0,0.65)', wmk:'rgba(255,255,255,0.12)' }
  };

  const C = STYLES[style] || STYLES.dark;
  const isVert = orientation === 'vertical';
  const W = isVert ? 540 : 800;
  const H = isVert ? 720 : 500;
  const imgY = isVert ? 95 : 70;
  const imgH = isVert ? H - 130 : H - 85;

  const footer1 = footerLine.split('  Â·  ')[0] || '';
  const footer2 = footerLine.split('  Â·  ')[1] || '';
  const footer3 = footerLine.split('  Â·  ')[2] || '';

  const inlineSvg = svgDataUrl ? svgDataUrl.replace(/^data:image\/svg\+xml;base64,/, '') : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ESC(title || 'Ma Carte du Ciel')}</title>
</head>
<body style="margin:0;padding:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:'Segoe UI',Arial,sans-serif">
<div style="position:relative;width:${W}px;height:${H}px;background:linear-gradient(135deg,${C.bg1},${C.bg2});box-shadow:0 8px 32px ${C.shd};border-radius:12px;overflow:hidden;margin:20px">
${inlineSvg ? `<img src="data:image/svg+xml;base64,${inlineSvg}" style="position:absolute;top:${imgY}px;left:0;width:100%;height:${imgH}px;object-fit:cover;opacity:0.9" alt="">` : ''}
<div style="position:absolute;bottom:0;left:0;right:0;padding:20px 22px;background:linear-gradient(to top,rgba(0,0,0,0.5),transparent)">
<div style="font-size:20px;font-weight:700;color:${C.txt};margin-bottom:2px">${ESC(title || '')}</div>
<div style="font-size:12px;font-weight:500;color:${C.sub};margin-bottom:6px">${ESC(subtitle || '')}</div>
<div style="font-size:10px;color:${C.sub};opacity:0.8">${ESC(footer1)}</div>
<div style="font-size:10px;color:${C.sub};opacity:0.6">${ESC(footer2)}</div>
<div style="font-size:10px;color:${C.sub};opacity:0.5">${ESC(footer3)}</div>
</div>
<div style="position:absolute;bottom:10px;left:14px;font-size:9px;color:${C.wmk};pointer-events:none;opacity:0.7">sky-store.com</div>
</div>
</body>
</html>`;
}

// ============================================================
// CREATE CHECKOUT
// ============================================================

async function createCheckout(req, res) {
  try {
    const userId = req.session.userId || null;
    const tenantId = req.tenantId || req.session?.tenantId || DEFAULT_TENANT_ID;
    const guestEmail = String(req.body?.customerEmail || '').trim().toLowerCase();
    const guestName = String(req.body?.customerName || '').trim();
    let cartItems = [];

    if (userId) {
      // Utiliser le panier DB pour les utilisateurs connectes
      cartItems = await getCartDb(userId);
    } else {
      cartItems = (req.session.cart || { items: [] }).items || [];
    }

    if (!cartItems.length) {
      return res.status(400).json({ error: 'Panier vide' });
    }
    console.log('[checkout][debug] incoming', {
      userId,
      tenantId,
      sessionId: req.sessionID || null,
      cartCount: cartItems.length,
      cartItems: cartItems.map(i => ({
        id: i.id,
        type: i.type,
        title: i.title,
        price: i.price,
        quantity: i.quantity || 1,
        isBonus: !!i.isBonus,
        hasMetadata: !!i.metadata
      }))
    });

    const normalizedCart = normalizeAndValidateCheckoutItems(cartItems);
    if (normalizedCart.mismatches.length > 0) {
      console.warn('[checkout] Validation prix refusee', {
        user: userId ? 'authenticated' : 'guest',
        mismatchCount: normalizedCart.mismatches.length,
        mismatches: normalizedCart.mismatches.map(m => ({
          type: m.type,
          expected: m.expected,
          received: m.received,
          reason: m.reason
        }))
      });
      return res.status(400).json({
        error: 'Panier invalide: montants incoherents detectes. Rafraichissez le panier et reessayez.'
      });
    }
    cartItems = normalizedCart.normalizedItems;

    const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    // Obtenir l'email client
    let customerEmail = null;
    let customerName = null;
    if (userId) {
      const s1 = await db.prepare('SELECT email, name FROM users WHERE id = ?');
      const user = s1.get(userId);
      customerEmail = user?.email;
      customerName = user?.name || null;
    } else if (guestEmail) {
      customerEmail = guestEmail;
      customerName = guestName || null;
    }

    // Verifier les credits bonus
    let bonusCreditsAvailable = 0;
    if (userId) {
      const s2 = await db.prepare(`
      SELECT COALESCE(SUM(free_photo_credit), 0) as c
      FROM orders WHERE user_id = ? AND status = 'delivered'
    `);
      const credits = s2.get(userId);
      bonusCreditsAvailable = credits?.c || 0;
    }

    const stripeItems = [];
    const bonusPhotoItems = [];
    let bonusCreditUsed = 0;
    const skyMapsInCart = cartItems.filter(i => i.type === 'sky_map').length;
    const cartPhotoCount = cartItems.filter(i => i.type === 'photo' && !i.isBonus).length;
    let autoFreePhotosRemaining = Math.min(skyMapsInCart, cartPhotoCount);

    for (const item of cartItems) {
      if (item.type === 'photo' && !item.isBonus && autoFreePhotosRemaining > 0) {
        autoFreePhotosRemaining--;
        bonusPhotoItems.push({
          ...item,
          type: 'bonus_photo',
          isBonus: true,
          price: 0,
          metadata: { ...(item.metadata || {}), autoFreePhoto: true }
        });
      } else if (item.isBonus) {
        if (bonusCreditsAvailable > bonusCreditUsed) bonusCreditUsed++;
        bonusPhotoItems.push({
          ...item,
          type: 'bonus_photo',
          isBonus: true,
          price: 0
        });
      } else {
        stripeItems.push({
          productId: item.id,
          type: item.type,
          title: item.title,
          price: item.price,
          quantity: item.quantity || 1,
          metadata: item.metadata || {}
        });
      }
    }

    const paidAmbiances = stripeItems.filter(i => i.type === 'ambiance');
    if (paidAmbiances.length > 0) {
      const prices = calculateAmbiancePriceDistribution(paidAmbiances.length);
      for (let i = 0; i < paidAmbiances.length; i++) {
        const item = paidAmbiances[i];
        item.price = prices[i] || 0;
        item.metadata = {
          ...(item.metadata || {}),
          ambianceBundleApplied: true,
          ambianceBundleCount: paidAmbiances.length,
          ambianceBundlePrice: prices[i] || 0
        };
      }
    }

    const hasSkyMap = stripeItems.some(i => i.type === 'sky_map');
    const hasPhoto = stripeItems.some(i => i.type === 'photo') || bonusPhotoItems.some(i => i.type === 'bonus_photo');
    const bonusAmbianceCount = (hasSkyMap ? 1 : 0) + (hasPhoto ? 1 : 0);
    const bonusAmbianceItems = [];
    if (bonusAmbianceCount > 0) {
      const paidAmbianceKeys = paidAmbiances
        .map(i => extractAmbianceKeyFromMetadata(i.metadata || {}))
        .filter(Boolean);
      const seed = JSON.stringify({
        orderContext: userId || customerEmail || 'guest',
        paidAmbianceCount: paidAmbiances.length,
        hasSkyMap,
        hasPhoto,
        sourceItems: stripeItems.map(i => ({ type: i.type, title: i.title, productId: i.productId || '' }))
      });
      const selectedBonus = selectBonusAmbiances({
        count: bonusAmbianceCount,
        excludedKeys: paidAmbianceKeys,
        seed
      });
      const sources = [];
      if (hasSkyMap) sources.push('card');
      if (hasPhoto) sources.push('photo');
      selectedBonus.forEach((bonus, idx) => {
        const source = sources[idx] || 'bonus';
        bonusAmbianceItems.push({
          productId: `bonus_ambiance_${bonus.ambianceId}_${idx}`,
          type: 'bonus_ambiance',
          title: source === 'card'
            ? `Ambiance offerte (Carte): ${bonus.title}`
            : source === 'photo'
              ? `Ambiance offerte (Photo): ${bonus.title}`
              : `Ambiance offerte: ${bonus.title}`,
          price: 0,
          quantity: 1,
          isBonus: true,
          metadata: {
            ambianceId: bonus.ambianceId,
            backgroundImageUrl: bonus.backgroundImageUrl,
            bonusSource: source
          }
        });
      });
    }

    const allItems = [
      ...stripeItems.map(i => ({ ...i, quantity: i.quantity || 1 })),
      ...bonusPhotoItems.map(i => ({ ...i, price: 0, quantity: 1, isBonus: true })),
      ...bonusAmbianceItems
    ];

    const subtotal = stripeItems.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
    const taxes = Math.round(subtotal * TAX_RATE);
    const total = subtotal + taxes;
    console.log('[checkout][debug] totals', {
      subtotal,
      taxes,
      total,
      stripeItems: stripeItems.map(i => ({
        type: i.type,
        title: i.title,
        price: i.price,
        quantity: i.quantity || 1
      })),
      bonusPhotoItems: bonusPhotoItems.map(i => ({
        type: i.type,
        title: i.title,
        price: i.price,
        quantity: i.quantity || 1
      }))
    });

    // Creer la commande et recuperer l'ID depuis la meme operation (pas de MAX(id))
    const insertOrder = await db.prepare(`
    INSERT INTO orders (user_id, customer_email, customer_name, status, total, free_photo_credit, tenant_id)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)
  `);
    insertOrder.run(
      userId,
      customerEmail,
      customerName,
      total,
      stripeItems.filter(i => i.type === 'sky_map').length,
      tenantId
    );
    const orderId = Number(insertOrder.lastInsertRowid || 0);
    if (!orderId) {
      console.error('[checkout] ERREUR: impossible de recuperer orderId apres insertion');
      return res.status(500).json({ error: 'Erreur interne de creation de commande' });
    }

    // Inserer les items avec l'orderId nouvellement cree
    const insertItem = await db.prepare(`
    INSERT INTO order_items (order_id, product_type, product_title, price, is_bonus, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    for (const item of allItems) {
      insertItem.run(
        orderId,
        item.type,
        item.title,
        item.price,
        item.isBonus ? 1 : 0,
        JSON.stringify(item.metadata || {})
      );
    }

    // Session Stripe
    const { sessionId, url, mock } = await createCheckoutSession(
      allItems.map(i => ({
        productId: i.productId,
        type: i.type,
        title: i.title,
        price: i.price,
        quantity: i.quantity || 1,
        metadata: i.metadata
      })),
      `${BASE_URL}/success?order_id=${orderId}`,
      `${BASE_URL}/cancel`,
      customerEmail,
      taxes
    );

    const upd = await db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?');
    await upd.run(sessionId, orderId);

    return res.json({ orderId, sessionId, url, mock, subtotal, taxes, total });
  } catch (err) {
    console.error('[checkout] Echec creation checkout:', err && err.stack ? err.stack : err.message);
    return res.status(500).json({ error: 'Echec creation checkout. Reessayez dans quelques secondes.' });
  }
}

// ============================================================
// CHECK STATUS
// ============================================================

async function checkStatus(req, res) {
  const { session_id, order_id } = req.query;
  const tenantId = req.tenantId || req.session?.tenantId || DEFAULT_TENANT_ID;
  const sessionUserId = req.session?.userId != null ? Number(req.session.userId) : null;
  let finalizationPending = false;

  if (!session_id && !order_id) {
    return res.status(400).json({ error: 'session_id ou order_id requis' });
  }

  let order;
  let mock = false;

  // Chercher d'abord par order_id
  if (order_id) {
    const s = await db.prepare('SELECT * FROM orders WHERE id = ?');
    order = s.get(parseInt(order_id, 10));
  }

  // Si pas trouve par order_id, chercher par session_id
  if (!order && session_id) {
    const s = await db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?');
    order = s.get(session_id);
  }

  // Si toujours pas trouve
  if (!order) {
    return res.status(404).json({ error: 'Commande non trouvee' });
  }
  if ((order.tenant_id || DEFAULT_TENANT_ID) !== tenantId) {
    return res.status(404).json({ error: 'Commande non trouvee' });
  }

  // Controle d'acces strict: un order user doit appartenir a la session,
  // un order invite ne peut etre interroge que via son session_id Stripe.
  const orderUserId = order.user_id != null ? Number(order.user_id) : null;
  const isOwner = orderUserId != null && sessionUserId != null && orderUserId === sessionUserId;
  const isGuestSessionMatch = orderUserId == null && !!session_id && order.stripe_session_id === session_id;
  if (!isOwner && !isGuestSessionMatch) {
    return res.status(404).json({ error: 'Commande non trouvee' });
  }

  // Verifier et finaliser si necessaire
  if (session_id) {
    const { paid, mock: sessionMock, customerEmail } = await getSessionStatus(session_id);
    mock = sessionMock;
    if (paid && customerEmail && !order.customer_email) {
      const updEmail = await db.prepare('UPDATE orders SET customer_email = ? WHERE id = ?');
      await updEmail.run(customerEmail, order.id);
      order.customer_email = customerEmail;
    }
    // Appeler finalizeOrder tant que la commande n'est pas finalisee OU qu'une finalisation partielle est detectee.
    // On tente jusqu'a 2 fois pour couvrir un delai court de disponibilite des fichiers.
    if (paid) {
      const sItems = await db.prepare('SELECT COUNT(*) as c FROM order_items WHERE order_id = ?');
      const sTok = await db.prepare('SELECT COUNT(DISTINCT order_item_id) as c FROM download_tokens WHERE order_id = ?');
      for (let attempt = 1; attempt <= 2; attempt++) {
        const { c: itemCount } = sItems.get(order.id);
        const { c: tokenCount } = sTok.get(order.id);
        if (order.status === 'paid' && tokenCount >= itemCount) {
          break;
        }
        await runFinalizeOrderWorkflow({
          orderId: order.id,
          userId: order.user_id,
          tenantId,
          correlationId: req.headers['x-request-id'] || req.headers['x-correlation-id'] || '',
          source: attempt === 1 ? 'checkout_status' : 'checkout_status_retry'
        });
        const s2 = await db.prepare('SELECT * FROM orders WHERE id = ?');
        order = s2.get(order.id);
        if (order?.status === 'paid') break;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      if (order.status !== 'paid' && order.status !== 'delivered') {
        finalizationPending = true;
      }
    }
  }

  // Vider le panier session uniquement apres paiement confirme.
  if (order.status === 'paid' || order.status === 'delivered') {
    req.session.cart = { items: [], bonusUsed: false };
  }

  res.json({
    status: order.status,
    mock,
    finalizationPending,
    retryable: finalizationPending
  });
}

// ============================================================
// FINALISER UNE COMMANDE
// ============================================================

async function finalizeOrder(orderId, userId) {
  const s1 = await db.prepare('SELECT * FROM orders WHERE id = ?');
  const order = s1.get(orderId);
  if (!order || (order.status !== 'pending' && order.status !== 'paid')) {
    console.log('[finalize] Order', orderId, 'ignored: not found or status', order?.status);
    return;
  }

  const s2 = await db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const items = s2.all(orderId);
  console.log('[finalize] Order', orderId, 'items:', items.length, 'status:', order.status);
  let hasFailure = false;

  for (const item of items.filter(i => i.product_type === 'sky_map')) {
    const meta = JSON.parse(item.metadata || '{}');
    const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');
    const canonicalCleanPath = resolveCanonicalCleanPath(meta, item.id, STORAGE_PATH);
    const legacyItem = isLegacySkyMapItem(meta);

    try {
      if (!legacyItem) {
        if (!fs.existsSync(canonicalCleanPath)) {
          throw new Error('fichier canonique introuvable: ' + canonicalCleanPath);
        }
        console.log(`[finalizeOrder] Item ${item.id}: source canonique build-map OK (${canonicalCleanPath})`);
      }

      const footerLine = [meta.date, meta.time ? ' ' + meta.time : '', meta.location_name].filter(Boolean).join('  Â·  ');
      const fullCardHtml = legacyItem
        ? (meta.validatedCardHtml
          || (meta.previewSvgDataUrl
            ? buildFullCardHtml(
                meta.title || item.product_title || 'Ma Carte du Ciel',
                meta.subtitle || '',
                footerLine,
                meta.style || 'dark',
                meta.orientation || 'vertical',
                meta.previewSvgDataUrl
              )
            : null))
        : null;

      if (legacyItem) {
        console.log(`[finalizeOrder] Item ${item.id}: compat legacy=${fullCardHtml ? 'activee' : 'sans source'}`);
      }

      const sExistingTok = await db.prepare('SELECT token, expires_at FROM download_tokens WHERE order_id = ? AND order_item_id = ? ORDER BY created_at DESC LIMIT 1');
      const existingTok = sExistingTok.get(orderId, item.id);
      const token = existingTok?.token || uuidv4();
      const expiresAt = existingTok?.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      if (!existingTok) {
        const insertTok = await db.prepare(`
          INSERT INTO download_tokens (token, order_id, order_item_id, user_id, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        await insertTok.run(token, orderId, item.id, order.user_id, expiresAt);
      }

      // Aucun fallback de regeneration a ce stade:
      // le PNG client doit deja exister depuis saveCardFiles.
      let imagePath = meta.imagePath || null;
      if (!imagePath || !fs.existsSync(imagePath)) {
        if (!fs.existsSync(canonicalCleanPath)) {
          throw new Error('png client final manquant (source canonique absente)');
        }
        const cardId = meta.cardPreviewId || `order${orderId}_item${item.id}`;
        console.warn(`[finalizeOrder] Item ${item.id}: PNG manquant, tentative regeneration screenshot depuis source canonique`);
        const regenerated = await captureCardPngFromHtml({
          cleanHtmlPath: canonicalCleanPath,
          cardId,
          storagePath: STORAGE_PATH
        });
        imagePath = regenerated?.imagePath || null;
        if (!imagePath || !fs.existsSync(imagePath)) {
          throw new Error('png client final manquant apres tentative regeneration');
        }
      }

      const updItem = await db.prepare('UPDATE order_items SET metadata = ? WHERE id = ?');
      await updItem.run(JSON.stringify({
        ...meta,
        fullCardHtml,
        canonicalSource: legacyItem ? 'legacy_compat' : 'build_map_saved',
        canonicalCleanPath: '/storage/private/' + path.basename(canonicalCleanPath),
        imagePath,
        downloadToken: token
      }), item.id);
    } catch (e) {
      console.error(`[Order ${orderId}] Erreur finalize sky_map: ${e.message}`);
      hasFailure = true;
    }
  }

  for (const item of items.filter(i =>
    i.product_type === 'photo' ||
    i.product_type === 'bonus_photo' ||
    i.product_type === 'ambiance' ||
    i.product_type === 'bonus_ambiance'
  )) {
    try {
      const sExistingTok = await db.prepare('SELECT token, expires_at FROM download_tokens WHERE order_id = ? AND order_item_id = ? ORDER BY created_at DESC LIMIT 1');
      const existingTok = sExistingTok.get(orderId, item.id);
      const token = existingTok?.token || uuidv4();
      const expiresAt = existingTok?.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      if (!existingTok) {
        const insertTok = await db.prepare(`
          INSERT INTO download_tokens (token, order_id, order_item_id, user_id, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        await insertTok.run(token, orderId, item.id, order.user_id, expiresAt);
      }

      const meta = JSON.parse(item.metadata || '{}');
      const updItem = await db.prepare('UPDATE order_items SET metadata = ? WHERE id = ?');
      await updItem.run(JSON.stringify({ ...meta, downloadToken: token }), item.id);
    } catch (e) {
      console.error(`[Order ${orderId}] Erreur finalize media (${item.product_type}): ${e.message}`);
      hasFailure = true;
    }
  }

  if (hasFailure) {
    console.error('[finalize] Order', orderId, 'not marked paid: finalization incomplete');
    return;
  }

  const updOrder = await db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?");
  await updOrder.run(orderId);

  // Vider le panier DB uniquement apres paiement confirme.
  if (order.user_id) {
    await db.run('DELETE FROM cart WHERE user_id = ?', order.user_id);
  }

  let recipientEmail = order.customer_email || null;
  let recipientName = order.customer_name || '';
  if (order.user_id) {
    const s3 = await db.prepare('SELECT * FROM users WHERE id = ?');
    const user = s3.get(order.user_id);
    if (user?.email) recipientEmail = user.email;
    if (user?.name) recipientName = user.name;
  }

  if (recipientEmail) {
    const s4 = await db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    const allItems = s4.all(orderId);
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const downloadLinks = allItems.flatMap((it) => {
      if (it.product_type !== 'sky_map') return [];
      let meta = {};
      try { meta = JSON.parse(it.metadata || '{}'); } catch (_) {}
      const token = meta.downloadToken;
      if (!token) return [];
      return [{ label: `Carte #${it.id} (PNG)`, url: `${baseUrl}/api/download/${token}` }];
    });
    sendEmail({
      to: recipientEmail,
      ...orderConfirmationEmail({
        customerName: recipientName || 'client',
        orderId,
        items: allItems,
        total: order.total,
        orderDate: order.created_at,
        downloadLinks
      })
    }).catch(e => console.error('[Email] Erreur envoi:', e.message));
  } else {
    console.warn('[Email] Aucun destinataire pour la commande', orderId);
  }
}
// ============================================================
// DOWNLOAD FILE
// ============================================================

async function downloadFile(req, res) {
  const { token } = req.params;

  const s1 = await db.prepare('SELECT * FROM download_tokens WHERE token = ?');
  const tokenRecord = s1.get(token);

  if (!tokenRecord) return res.status(404).json({ error: 'Lien invalide' });
  if (new Date(tokenRecord.expires_at) < new Date()) return res.status(410).json({ error: 'Ce lien a expire' });
  if (tokenRecord.used && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Lien deja utilise' });
  }

  // Acces par lien tokenise: pas de session requise (email/partage client).
  // La securite repose sur l'entropie du token + expiration + (optionnellement) usage unique en production.
  const markTokenUsed = async () => {
    try {
      const updTok = await db.prepare('UPDATE download_tokens SET used = 1 WHERE token = ?');
      await updTok.run(token);
    } catch (err) {
      console.error(`[downloadFile] Echec marquage token utilise (${tokenRecord.token}):`, err.message);
    }
  };

  let item = null;
  if (tokenRecord.order_item_id) {
    const s3 = await db.prepare('SELECT * FROM order_items WHERE id = ?');
    item = s3.get(tokenRecord.order_item_id);
  }
  if (!item) {
    const s4 = await db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    const orderItems = s4.all(tokenRecord.order_id);
    item = orderItems.find(i => {
      try {
        const meta = JSON.parse(i.metadata || '{}');
        return meta.downloadToken === token;
      } catch { return false; }
    }) || null;
  }
  if (!item) return res.status(404).json({ error: 'Fichier non trouve' });

  const meta = JSON.parse(item.metadata || '{}');
  const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');

  // === sky_map: servir le PNG client final (genere a la validation) ===
  if (item.product_type === 'sky_map') {
    const imagePath = meta.imagePath || null;
    if (imagePath && fs.existsSync(imagePath)) {
      console.log(`[downloadFile] Item ${item.id}: PNG client ${imagePath}`);
      return res.download(imagePath, 'carte-du-ciel.png', (err) => {
        if (err) {
          console.error(`[downloadFile] Echec livraison sky_map item ${item.id} (token ${tokenRecord.token}):`, err.message);
          if (!res.headersSent) return res.status(500).json({ error: 'Echec du telechargement' });
          return;
        }
        markTokenUsed();
      });
    }
    return res.status(503).json({ error: 'PNG final non disponible pour cette carte.' });
  }
  // === photo / ambiance ===
  const resolvedMetaPath = resolveFilePathFromMetadata(item, meta, STORAGE_PATH);
  let filePath = resolvedMetaPath || meta.pdfPath || meta.imagePath;
  if (!filePath && (item.product_type === 'photo' || item.product_type === 'bonus_photo')) {
    filePath = gallery.getFullPath(meta.photoId);
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier non disponible' });
  }

  const fileName = path.basename(filePath);
  return res.download(filePath, fileName, (err) => {
    if (err) {
      console.error(`[downloadFile] Echec livraison item ${item.id} (token ${tokenRecord.token}):`, err.message);
      if (!res.headersSent) return res.status(500).json({ error: 'Echec du telechargement' });
      return;
    }
    markTokenUsed();
  });
}

// ============================================================
// LIST FOR USER
// ============================================================

async function listForUser(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const tenantId = req.tenantId || req.session?.tenantId || DEFAULT_TENANT_ID;

  const s1 = await db.prepare(`
    SELECT * FROM orders WHERE user_id = ? AND tenant_id = ? ORDER BY created_at DESC
  `);
  const orders = s1.all(req.session.userId, tenantId);

  const result = await Promise.all(orders.map(async (order) => {
    const s2 = await db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    const items = s2.all(order.id);

    const s3 = await db.prepare(`
      SELECT dt.*, oi.product_title, oi.product_type
      FROM download_tokens dt
      JOIN order_items oi ON oi.id = dt.order_item_id
      WHERE dt.order_id = ? AND dt.user_id = ?
    `);
    const tokens = s3.all(order.id, req.session.userId);

    const tokenByItem = {};
    tokens.forEach(t => { tokenByItem[t.order_item_id] = t; });

    return {
      ...order,
      items: items.map(item => {
        const token = tokenByItem[item.id] || null;
        return {
          ...item,
          metadata: JSON.parse(item.metadata || '{}'),
          downloadToken: token ? token.token : null,
          tokenExpired: token ? new Date(token.expires_at) <= new Date() : true,
          tokenUsed: token ? !!token.used : false
        };
      }),
      downloadTokens: tokens.map(t => ({
        token: t.token,
        orderItemId: t.order_item_id,
        productTitle: t.product_title,
        productType: t.product_type,
        expiresAt: t.expires_at,
        used: !!t.used
      }))
    };
  }));

  res.json({ orders: result });
}

// ============================================================
// GET ONE ORDER
// ============================================================

async function getOne(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const tenantId = req.tenantId || req.session?.tenantId || DEFAULT_TENANT_ID;
  const s1 = await db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?');
  const order = s1.get(parseInt(req.params.id, 10), tenantId);
  if (!order) return res.status(404).json({ error: 'Commande non trouvee' });
  if (order.user_id !== req.session.userId) {
    const s2 = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
    const user = s2.get(req.session.userId);
    if (!user?.is_admin) return res.status(403).json({ error: 'Acces refuse' });
  }
  const s3 = await db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const items = s3.all(order.id);
  res.json({ ...order, items });
}

// ============================================================
// ADMIN: LIST ALL
// ============================================================

async function listAll(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const s1 = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const user = s1.get(req.session.userId);
  if (!user?.is_admin) return res.status(403).json({ error: 'Admin requis' });

  let query = 'SELECT o.*, u.name as customer_name, u.email as customer_email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE 1=1';
  const params = [];

  if (req.query.status) { query += ' AND o.status = ?'; params.push(req.query.status); }
  if (req.query.from)   { query += ' AND o.created_at >= ?'; params.push(req.query.from); }
  if (req.query.to)     { query += ' AND o.created_at <= ?'; params.push(req.query.to); }
  query += ' ORDER BY o.created_at DESC LIMIT 100';

  const stmt = await db.prepare(query);
  const orders = params.length ? stmt.all(...params) : stmt.all();

  const result = await Promise.all(orders.map(async (order) => {
    const s2 = await db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    const items = s2.all(order.id);
    return {
      ...order,
      items: items.map(item => ({ ...item, metadata: JSON.parse(item.metadata || '{}') }))
    };
  }));

  res.json({ orders: result });
}

// ============================================================
// ADMIN: MARK DELIVERED
// ============================================================

async function markDelivered(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const s1 = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const user = s1.get(req.session.userId);
  if (!user?.is_admin) return res.status(403).json({ error: 'Admin requis' });

  const s2 = await db.prepare('SELECT * FROM orders WHERE id = ?');
  const order = s2.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande non trouvee' });

  const upd1 = await db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?");
  await upd1.run(req.params.id);

  const s3 = await db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const items = s3.all(req.params.id);

  // Aucun rendu de carte en livraison: les cartes doivent deja avoir leur PNG final.
  for (const item of items.filter(i => i.product_type === 'sky_map')) {
    const meta = JSON.parse(item.metadata || '{}');
    if (!meta.imagePath || !fs.existsSync(meta.imagePath)) {
      console.warn(`[markDelivered] Item ${item.id}: png final manquant (aucune regeneration effectuee)`);
    }
  }

  const skyMapCount = items.filter(i => i.product_type === 'sky_map').length;
  if (skyMapCount > 0 && order.user_id) {
    const updOrd = await db.prepare('UPDATE orders SET free_photo_credit = ? WHERE id = ?');
    await updOrd.run(skyMapCount, req.params.id);
  }

  res.json({ success: true });
}

// ============================================================
// ADMIN: STATS
// ============================================================

async function adminStats(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const s1 = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const user = s1.get(req.session.userId);
  if (!user?.is_admin) return res.status(403).json({ error: 'Admin requis' });

  const sCount = await db.prepare('SELECT COUNT(*) as c FROM orders');
  const sPaid  = await db.prepare("SELECT COUNT(*) as c FROM orders WHERE status IN ('paid','delivered')");
  const sRev   = await db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM orders WHERE status IN ('paid','delivered')");
  const sUsers = await db.prepare('SELECT COUNT(*) as c FROM users');
  const sBonus = await db.prepare("SELECT COUNT(*) as c FROM order_items WHERE is_bonus = 1");

  res.json({
    totalOrders:   sCount.all()[0]?.c ?? 0,
    paidOrders:    sPaid.all()[0]?.c ?? 0,
    totalRevenue:  sRev.all()[0]?.t ?? 0,
    totalUsers:    sUsers.all()[0]?.c ?? 0,
    totalPhotos:   gallery.getPhotos().length,
    bonusPhotosUsed: sBonus.all()[0]?.c ?? 0
  });
}

async function resolveAdminOrderItemFile(item) {
  const meta = JSON.parse(item.metadata || '{}');
  const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');

  if (item.product_type === 'sky_map') {
    if (meta.imagePath && fs.existsSync(meta.imagePath)) {
      return { filePath: meta.imagePath, fileName: 'carte-du-ciel.png', contentType: 'image/png' };
    }
    const cleanPath = resolveCanonicalCleanPath(meta, item.id, STORAGE_PATH);
    if (fs.existsSync(cleanPath)) {
      return { filePath: cleanPath, fileName: 'carte-du-ciel.html', contentType: 'text/html; charset=utf-8' };
    }
    return null;
  }

  let filePath = meta.pdfPath || meta.imagePath;
  if (!filePath && (item.product_type === 'photo' || item.product_type === 'bonus_photo')) {
    filePath = gallery.getFullPath(meta.photoId);
  }
  if (!filePath || !fs.existsSync(filePath)) return null;
  return {
    filePath,
    fileName: path.basename(filePath),
    contentType: null
  };
}

async function adminOpenOrderItem(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const s1 = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const user = s1.get(req.session.userId);
  if (!user?.is_admin) return res.status(403).json({ error: 'Admin requis' });

  const itemId = parseInt(req.params.itemId, 10);
  if (!itemId) return res.status(400).json({ error: 'Item invalide' });
  const s2 = await db.prepare('SELECT * FROM order_items WHERE id = ?');
  const item = s2.get(itemId);
  if (!item) return res.status(404).json({ error: 'Item introuvable' });

  const resolved = await resolveAdminOrderItemFile(item);
  if (!resolved) return res.status(404).json({ error: 'Fichier indisponible' });

  if (resolved.contentType) res.type(resolved.contentType);
  return res.sendFile(path.resolve(resolved.filePath));
}

async function adminDownloadOrderItem(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const s1 = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const user = s1.get(req.session.userId);
  if (!user?.is_admin) return res.status(403).json({ error: 'Admin requis' });

  const itemId = parseInt(req.params.itemId, 10);
  if (!itemId) return res.status(400).json({ error: 'Item invalide' });
  const s2 = await db.prepare('SELECT * FROM order_items WHERE id = ?');
  const item = s2.get(itemId);
  if (!item) return res.status(404).json({ error: 'Item introuvable' });

  const resolved = await resolveAdminOrderItemFile(item);
  if (!resolved) return res.status(404).json({ error: 'Fichier indisponible' });

  return res.download(path.resolve(resolved.filePath), resolved.fileName);
}

// ============================================================
// SAVE CARD FILES â€” ecrit 2 fichiers HTML sur disque a la validation
// ============================================================

async function saveCardFiles(req, res) {
  // Les fichiers previews sont publics (watermerkes) â€” pas de auth requise
  // La verification de propriete se fait au telechargement final
  try {
    const { cardId, watermarkedHtml, cleanHtml, exportOptions = {} } = req.body;
    if (!cardId || !watermarkedHtml || !cleanHtml) {
      return res.status(400).json({ error: 'cardId, watermarkedHtml et cleanHtml requis' });
    }

    const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');
    const previewsDir = path.join(STORAGE_PATH, 'previews');
    const privateDir = path.join(STORAGE_PATH, 'private');
    if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true });
    if (!fs.existsSync(privateDir)) fs.mkdirSync(privateDir, { recursive: true });

    const fileName = cardId + '.html';
    const cleanFileName = cardId + '_clean.html';

    const watermarkedPath = path.join(previewsDir, fileName);
    const cleanPath = path.join(privateDir, cleanFileName);

    fs.writeFileSync(watermarkedPath, watermarkedHtml, 'utf8');
    const cleanEmbedded = embedBackgroundImages(cleanHtml);
    const cleanStandalone = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Marcellus&family=Montserrat:wght@300;400;500&family=Lora:ital,wght@0,400;0,600;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
</style>
</head>
<body><div data-card-root="1" style="display:inline-block;line-height:0;">${cleanEmbedded}</div></body>
</html>`;
    fs.writeFileSync(cleanPath, cleanStandalone, 'utf8');

    if (!fs.existsSync(watermarkedPath) || !fs.existsSync(cleanPath)) {
      return res.status(500).json({ error: 'Echec de verification des fichiers canoniques' });
    }

    const generated = await captureCardPngFromHtml({
      cleanHtmlPath: cleanPath,
      cardId,
      storagePath: STORAGE_PATH
    });
    if (!generated.imagePath || !fs.existsSync(generated.imagePath)) {
      return res.status(500).json({ error: 'generation PNG final echouee' });
    }

    console.log('[card/save] Source canonique ecrite:', watermarkedPath, 'et', cleanPath);
    console.log(
      '[card/save] PNG final screenshot genere:',
      generated.imagePath,
      '| selector:',
      generated.selectorUsed,
      '| root:',
      generated.metrics?.root,
      '| child:',
      generated.metrics?.child
    );

    res.json({
      cardId,
      previewFilePath: '/storage/previews/' + fileName,
      privateFilePath: '/storage/private/' + cleanFileName,
      pdfPath: null,
      imagePath: generated.imagePath,
      exportWarning: null,
      canonicalSource: 'build_map_saved'
    });
  } catch (e) {
    console.error('[card/save] Erreur:', e.message);
    res.status(500).json({ error: e.message });
  }
}

// ============================================================
// DELETE ORDER
// ============================================================

async function deleteOrder(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const tenantId = req.tenantId || req.session?.tenantId || DEFAULT_TENANT_ID;

  const orderId = parseInt(req.params.id, 10);
  if (!orderId) return res.status(400).json({ error: 'ID invalide' });

  // Verifier que l'utilisateur est proprietaire ou admin
  const sCheck = await db.prepare('SELECT user_id FROM orders WHERE id = ? AND tenant_id = ?');
  const order = sCheck.get(orderId, tenantId);
  if (!order) return res.status(404).json({ error: 'Commande non trouvee' });

  if (order.user_id !== req.session.userId) {
    const sAdmin = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
    const user = sAdmin.get(req.session.userId);
    if (!user?.is_admin) return res.status(403).json({ error: 'Acces refuse' });
  }

  // Recuperer les cardPreviewId de chaque item pour supprimer les fichiers
  const sItems = await db.prepare('SELECT id, metadata FROM order_items WHERE order_id = ?');
  const items = sItems.all(orderId);

  const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');
  const privateDir = path.join(STORAGE_PATH, 'private');
  const previewDir = path.join(STORAGE_PATH, 'previews');

  for (const item of items) {
    const meta = JSON.parse(item.metadata || '{}');
    const cardId = meta.cardPreviewId;
    if (cardId) {
      // Supprimer la version sans filigrane
      const cleanFile = path.join(privateDir, cardId + '_clean.html');
      if (fs.existsSync(cleanFile)) { fs.unlinkSync(cleanFile); }
      // Supprimer la version filigranÃ©e (preview)
      const previewFile = path.join(previewDir, cardId + '.html');
      if (fs.existsSync(previewFile)) { fs.unlinkSync(previewFile); }
    }
  }

  // Supprimer les tokens de telechargement
  await db.run('DELETE FROM download_tokens WHERE order_id = ?', orderId);
  // Supprimer les items
  await db.run('DELETE FROM order_items WHERE order_id = ?', orderId);
  // Supprimer la commande
  await db.run('DELETE FROM orders WHERE id = ? AND tenant_id = ?', orderId, tenantId);

  res.json({ success: true });
}

module.exports = {
  createCheckout, checkStatus, finalizeOrder, runFinalizeOrderWorkflow,
  downloadFile, listForUser, getOne,
  listAll, markDelivered, adminStats,
  adminOpenOrderItem, adminDownloadOrderItem,
  buildFullCardHtml, saveCardFiles,
  deleteOrder
};


