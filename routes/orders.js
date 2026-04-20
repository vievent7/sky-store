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
const { createCheckoutSession, getSessionStatus } = require('../services/stripe-service');
const { captureCardPngFromHtml } = require('../services/html-screenshot');
const { sendEmail, orderConfirmationEmail } = require('../services/email-service');
const gallery = require('../services/photo-gallery');
const { renderSkyMap } = require('../services/sky-map-gen');
const { getSkyData } = require('../services/astro-engine');

const TAX_RATE = 0.14975;

function ambianceBundleTotal(count) {
  if (count >= 10) return 999;
  if (count >= 5) return 799;
  return count * 199;
}

function getAmbianceBatchKey(item, index) {
  const meta = item && item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const explicit = typeof meta.ambianceBatchId === 'string' ? meta.ambianceBatchId.trim() : '';
  if (explicit) return explicit;
  // Legacy items without batch id stay isolated per line to avoid wrong regrouping.
  return `legacy_single_${index}`;
}

function loadAmbianceCatalog() {
  try {
    const manifestPath = path.join(__dirname, '..', 'public', 'ambiances', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return [];
    const raw = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
    const manifest = JSON.parse(raw);
    return (manifest.tracks || []).map((track, index) => {
      const baseName = String(track.baseName || '').trim();
      if (!baseName) return null;
      let thumbExt = String(track.thumbExt || 'jpg').toLowerCase();
      if (!['jpg', 'jpeg', 'png'].includes(thumbExt)) thumbExt = 'jpg';
      return {
        id: String(track.id || ('track-' + index)),
        title: String(track.title || baseName.replace(/[_-]+/g, ' ').trim()),
        duration: String(track.duration || '3:20'),
        audioUrl: '/ambiances/' + encodeURIComponent(baseName + '.mp3'),
        thumbUrl: '/ambiances/' + encodeURIComponent(baseName + '.' + thumbExt)
      };
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function pickAmbianceFromCatalog(catalog, seedValue) {
  if (!catalog || !catalog.length) return null;
  const seed = String(seedValue || Math.random());
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return catalog[hash % catalog.length];
}

function resolveAmbianceAudioPath(audioUrl) {
  const raw = String(audioUrl || '');
  if (!raw) return null;
  const relativeRaw = raw.startsWith('/') ? raw.replace(/^\//, '') : raw;
  const candidates = [relativeRaw];
  try { candidates.push(decodeURIComponent(relativeRaw)); } catch (_) {}
  try { candidates.push(decodeURIComponent(decodeURIComponent(relativeRaw))); } catch (_) {}
  for (const rel of candidates) {
    const full = path.join(__dirname, '..', 'public', rel);
    if (fs.existsSync(full)) return full;
  }
  // Fallback robuste: retrouver le fichier dans /public/ambiances par son basename decode.
  try {
    const ambianceDir = path.join(__dirname, '..', 'public', 'ambiances');
    const decodedBase = path.basename(decodeURIComponent(relativeRaw));
    const files = fs.readdirSync(ambianceDir);
    const found = files.find(f => f === decodedBase);
    if (found) return path.join(ambianceDir, found);
  } catch (_) {}
  return null;
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

  const paidAmbianceGroups = new Map();
  for (let i = 0; i < stripeItems.length; i++) {
    const item = stripeItems[i];
    if (item.type !== 'ambiance') continue;
    const groupKey = getAmbianceBatchKey(item, i);
    if (!paidAmbianceGroups.has(groupKey)) paidAmbianceGroups.set(groupKey, []);
    paidAmbianceGroups.get(groupKey).push(item);
  }
  for (const [groupKey, groupItems] of paidAmbianceGroups.entries()) {
    const bundle = ambianceBundleTotal(groupItems.length);
    for (let i = 0; i < groupItems.length; i++) {
      const item = groupItems[i];
      item.price = i === 0 ? bundle : 0;
      item.metadata = {
        ...(item.metadata || {}),
        ambianceBundleApplied: true,
        ambianceBundleCount: groupItems.length,
        ambianceBundleTotal: bundle,
        ambianceBundleGroup: groupKey
      };
    }
  }

  const paidAndBonusItems = [
    ...stripeItems.map(i => ({ ...i, quantity: i.quantity || 1 })),
    ...bonusPhotoItems.map(i => ({ ...i, price: 0, quantity: 1, isBonus: true }))
  ];

  const ambianceCatalog = loadAmbianceCatalog();
  const selectedAmbianceIds = new Set(
    paidAndBonusItems
      .filter(i => i.type === 'ambiance')
      .map(i => String((i.metadata && i.metadata.ambianceId) || '').trim())
      .filter(Boolean)
  );
  const ambianceCatalogWithoutSelection = ambianceCatalog.filter(a => !selectedAmbianceIds.has(String(a.id)));
  const freeAmbiancePool = ambianceCatalogWithoutSelection.length ? ambianceCatalogWithoutSelection : ambianceCatalog;
  const freeAmbiancePoolUnique = freeAmbiancePool.slice();
  const eligibleForFreeAmbiance = paidAndBonusItems.filter(i =>
    i.type === 'sky_map' || i.type === 'photo' || i.type === 'bonus_photo'
  );
  const bonusAmbianceItems = [];
  for (let i = 0; i < eligibleForFreeAmbiance.length; i++) {
    const src = eligibleForFreeAmbiance[i];
    const poolForPick = freeAmbiancePoolUnique.length ? freeAmbiancePoolUnique : freeAmbiancePool;
    const ambiance = pickAmbianceFromCatalog(
      poolForPick,
      `${Date.now()}-${src.type}-${src.productId || src.title || i}-${i}`
    );
    if (!ambiance) continue;
    if (freeAmbiancePoolUnique.length) {
      const idx = freeAmbiancePoolUnique.findIndex(a => String(a.id) === String(ambiance.id));
      if (idx !== -1) freeAmbiancePoolUnique.splice(idx, 1);
    }
    bonusAmbianceItems.push({
      productId: 'free_amb_' + i + '_' + Date.now(),
      type: 'bonus_ambiance',
      title: 'Ambiance offerte - ' + ambiance.title,
      price: 0,
      quantity: 1,
      isBonus: true,
      metadata: {
        autoFreeAmbiance: true,
        grantedForType: src.type,
        grantedForProductId: src.productId || null,
        ambianceId: ambiance.id,
        thumbUrl: ambiance.thumbUrl,
        audioUrl: ambiance.audioUrl,
        duration: ambiance.duration
      }
    });
  }

  const allItems = [...paidAndBonusItems, ...bonusAmbianceItems];

  const subtotal = stripeItems.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
  const taxes = Math.round(subtotal * TAX_RATE);
  const total = subtotal + taxes;

  // Creer la commande â€” lastInsertRowid maintenant fiable car db.init() a ete await
  const insertOrder = await db.prepare(`
    INSERT INTO orders (user_id, customer_email, customer_name, status, total, free_photo_credit)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `);
  await insertOrder.run(
    userId,
    customerEmail,
    customerName,
    total,
    stripeItems.filter(i => i.type === 'sky_map').length
  );
  let orderId = Number(insertOrder.lastInsertRowid || 0);
  if (!orderId) {
    // Fallback defensif si lastInsertRowid est indisponible.
    const idStmt = await db.prepare('SELECT MAX(id) as id FROM orders');
    const idRow = idStmt.get();
    orderId = Number(idRow?.id || 0);
  }
  if (!orderId) {
    console.error('[checkout] ERREUR: impossible de recuperer orderId apres insertion');
    return res.status(500).json({ error: 'Erreur interne de creation de commande' });
  }

  // Inserer les items
  for (const item of allItems) {
    const insertItem = await db.prepare(`
      INSERT INTO order_items (order_id, product_type, product_title, price, is_bonus, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    await insertItem.run(
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

  res.json({ orderId, sessionId, url, mock, subtotal, taxes, total });
  } catch (err) {
    console.error('[checkout] Echec creation checkout:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Echec creation checkout. Reessayez dans quelques secondes.' });
  }
}

// ============================================================
// CHECK STATUS
// ============================================================

async function checkStatus(req, res) {
  const { session_id, order_id } = req.query;
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
        await finalizeOrder(order.id, order.user_id);
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
      if (item.product_type === 'ambiance' || item.product_type === 'bonus_ambiance') {
        const resolvedAudioPath = resolveAmbianceAudioPath(meta.audioUrl);
        if (resolvedAudioPath && fs.existsSync(resolvedAudioPath)) {
          meta.audioPath = resolvedAudioPath;
        }
      }
      const updItem = await db.prepare('UPDATE order_items SET metadata = ? WHERE id = ?');
      await updItem.run(JSON.stringify({ ...meta, downloadToken: token }), item.id);
    } catch (e) {
      console.error(`[Order ${orderId}] Erreur finalize photo: ${e.message}`);
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

  const updTok = await db.prepare('UPDATE download_tokens SET used = 1 WHERE token = ?');
  await updTok.run(token);

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
      return res.download(imagePath, 'carte-du-ciel.png');
    }
    return res.status(503).json({ error: 'PNG final non disponible pour cette carte.' });
  }

  // === ambiance ===
  if (item.product_type === 'ambiance' || item.product_type === 'bonus_ambiance') {
    const audioPath = (meta.audioPath && fs.existsSync(meta.audioPath))
      ? meta.audioPath
      : resolveAmbianceAudioPath(meta.audioUrl);
    if (!audioPath || !fs.existsSync(audioPath)) {
      console.warn('[download ambiance] introuvable', meta.audioUrl);
      return res.status(404).json({ error: 'Fichier ambiance non disponible' });
    }
    return res.download(audioPath, path.basename(audioPath));
  }

  // === photo ===
  let filePath = meta.pdfPath || meta.imagePath;
  if (!filePath && (item.product_type === 'photo' || item.product_type === 'bonus_photo')) {
    filePath = gallery.getFullPath(meta.photoId);
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier non disponible' });
  }

  const fileName = path.basename(filePath);
  res.download(filePath, fileName);
}

// ============================================================
// LIST FOR USER
// ============================================================

async function listForUser(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });

  const s1 = await db.prepare(`
    SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
  `);
  const orders = s1.all(req.session.userId);

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
  const s1 = await db.prepare('SELECT * FROM orders WHERE id = ?');
  const order = s1.get(parseInt(req.params.id, 10));
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

  if (item.product_type === 'ambiance' || item.product_type === 'bonus_ambiance') {
    const filePath = resolveAmbianceAudioPath(meta.audioUrl);
    if (!filePath || !fs.existsSync(filePath)) return null;
    return {
      filePath,
      fileName: path.basename(filePath),
      contentType: 'audio/mpeg'
    };
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

  const orderId = parseInt(req.params.id, 10);
  if (!orderId) return res.status(400).json({ error: 'ID invalide' });

  // Verifier que l'utilisateur est proprietaire ou admin
  const sCheck = await db.prepare('SELECT user_id FROM orders WHERE id = ?');
  const order = sCheck.get(orderId);
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
  await db.run('DELETE FROM orders WHERE id = ?', orderId);

  res.json({ success: true });
}

module.exports = {
  createCheckout, checkStatus, finalizeOrder,
  downloadFile, listForUser, getOne,
  listAll, markDelivered, adminStats,
  adminOpenOrderItem, adminDownloadOrderItem,
  buildFullCardHtml, saveCardFiles,
  deleteOrder
};


