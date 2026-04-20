/**
 * Cart — Panier persistant par compte utilisateur
 *
 * Logique:
 * - Utilisateur connecté  → panier stocké en DB (user_id)
 * - Utilisateur anonyme   → panier en session (req.session.cart)
 */

'use strict';

const { db } = require('../services/database');
const gallery = require('../services/photo-gallery');

// ============================================================
// HELPERS
// ============================================================

function getCartSession(req) {
  if (!req.session.cart) req.session.cart = { items: [], bonusUsed: false };
  return req.session.cart;
}

function saveCartSession(req, cart) {
  req.session.cart = cart;
}

function resolvePhotoPrice(metadata) {
  const photoId = metadata && metadata.photoId;
  if (!photoId) return null;
  const photo = gallery.getPhoto(photoId);
  if (!photo || !Number.isFinite(photo.price) || photo.price < 0) return null;
  return Math.round(photo.price);
}

function normalizeItemsPhotoPrices(items) {
  let changed = false;
  const normalizedItems = items.map(item => {
    if (item.type !== 'photo') return item;
    const serverPrice = resolvePhotoPrice(item.metadata || {});
    if (serverPrice === null || serverPrice === item.price) return item;
    changed = true;
    return { ...item, price: serverPrice };
  });
  return { items: normalizedItems, changed };
}

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

function annotateCartPricing(items) {
  const skyMapsInCart = items.filter(i => i.type === 'sky_map').length;
  const photos = items.filter(i => i.type === 'photo');
  const freePhotoCount = Math.min(skyMapsInCart, photos.length);

  let freePhotoIndex = 0;
  let annotatedItems = items.map(item => {
    if (item.type === 'photo') {
      const isFree = freePhotoIndex < freePhotoCount;
      freePhotoIndex++;
      return { ...item, isFree, displayPrice: isFree ? 0 : item.price };
    }
    return { ...item, isFree: false, displayPrice: item.price };
  });

  const paidAmbianceGroups = new Map();
  for (let i = 0; i < annotatedItems.length; i++) {
    const item = annotatedItems[i];
    if (item.type !== 'ambiance' || item.isBonus) continue;
    const groupKey = getAmbianceBatchKey(item, i);
    if (!paidAmbianceGroups.has(groupKey)) paidAmbianceGroups.set(groupKey, []);
    paidAmbianceGroups.get(groupKey).push(i);
  }
  for (const [groupKey, indexes] of paidAmbianceGroups.entries()) {
    const bundle = ambianceBundleTotal(indexes.length);
    for (let i = 0; i < indexes.length; i++) {
      const idx = indexes[i];
      annotatedItems[idx] = {
        ...annotatedItems[idx],
        displayPrice: i === 0 ? bundle : 0,
        ambianceBundleApplied: true,
        ambianceBundleCount: indexes.length,
        ambianceBundleGroup: groupKey
      };
    }
  }

  const total = annotatedItems.reduce((sum, item) => {
    if (item.isFree) return sum;
    return sum + (item.displayPrice || 0) * (item.quantity || 1);
  }, 0);

  return {
    items: annotatedItems,
    total,
    skyMapsInCart,
    freePhotoCount,
    freePhotosUsed: freePhotoCount
  };
}

// ---- DB helpers for persistent cart ----

async function getCartDb(userId) {
  const stmt = await db.prepare(`
    SELECT id, product_type, product_title, price, is_bonus, metadata, created_at
    FROM cart WHERE user_id = ?
    ORDER BY created_at ASC
  `);
  stmt.bind(userId);
  const rows = stmt.all();

  for (const row of rows) {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};
    if (row.product_type === 'photo') {
      const serverPrice = resolvePhotoPrice(metadata);
      if (serverPrice !== null && row.price !== serverPrice) {
        await db.run('UPDATE cart SET price = ? WHERE id = ? AND user_id = ?', serverPrice, row.id, userId);
        row.price = serverPrice;
      }
    }
    row._parsedMetadata = metadata;
  }

  return rows.map(row => ({
    id: 'db_' + row.id,
    type: row.product_type,
    title: row.product_title,
    price: row.price,
    isBonus: !!row.is_bonus,
    metadata: row._parsedMetadata || {},
    created_at: row.created_at
  }));
}

async function saveCartDb(userId, items) {
  // Supprimer l'ancien panier DB de l'utilisateur
  await db.run('DELETE FROM cart WHERE user_id = ?', userId);

  // Insérer les nouveaux items
  for (const item of items) {
    await db.run(
      `INSERT INTO cart (user_id, product_type, product_title, price, is_bonus, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      item.type,
      item.title,
      item.price,
      item.isBonus ? 1 : 0,
      JSON.stringify(item.metadata || {})
    );
  }
}

async function mergeSessionCartToDb(req) {
  // Appelé après login : fusionne le panier de session dans le panier DB
  const sessionCart = getCartSession(req);
  if (!sessionCart.items.length) return;

  const userId = req.session.userId;
  if (!userId) return;

  const dbCart = await getCartDb(userId);

  // Ajouter les items de session qui n'existent pas déjà (par type + metadata)
  for (const sItem of sessionCart.items) {
    const exists = dbCart.some(dbItem =>
      dbItem.type === sItem.type &&
      JSON.stringify(dbItem.metadata) === JSON.stringify(sItem.metadata || {})
    );
    if (!exists) {
      const itemPrice = sItem.type === 'photo'
        ? (resolvePhotoPrice(sItem.metadata || {}) ?? sItem.price)
        : sItem.price;
      await db.run(
        `INSERT INTO cart (user_id, product_type, product_title, price, is_bonus, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        userId, sItem.type, sItem.title, itemPrice,
        sItem.isBonus ? 1 : 0,
        JSON.stringify(sItem.metadata || {})
      );
    }
  }
}

// ============================================================
// GET CART — Calcule automatiquement les photos gratuites selon le nombre de cartes
// ============================================================

async function get(req, res) {
  const userId = req.session.userId;

  let items = [];
  if (userId) {
    items = await getCartDb(userId);
  } else {
    const cart = getCartSession(req);
    const normalized = normalizeItemsPhotoPrices(cart.items || []);
    if (normalized.changed) {
      cart.items = normalized.items;
      saveCartSession(req, cart);
    }
    items = normalized.items;
  }

  res.json(annotateCartPricing(items));
}

// ============================================================
// ADD ITEM
// ============================================================

async function addItem(req, res) {
  const { productId, type, title, price, metadata, quantity = 1 } = req.body;

  if (!type || !title || price === undefined) {
    return res.status(400).json({ error: 'type, title, price requis' });
  }

  let finalPrice = parseInt(price, 10);
  if (type === 'photo') {
    finalPrice = resolvePhotoPrice(metadata || {});
    if (finalPrice === null) {
      return res.status(400).json({ error: 'Photo invalide: prix serveur introuvable' });
    }
  }
  if (!Number.isFinite(finalPrice) || finalPrice < 0) {
    return res.status(400).json({ error: 'Prix invalide' });
  }

  const userId = req.session.userId;

  if (userId) {
    await db.run(
      'INSERT INTO cart (user_id, product_type, product_title, price, is_bonus, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      userId, type, title, finalPrice, 0,
      JSON.stringify(metadata || {})
    );
    const items = await getCartDb(userId);
    return res.json({ success: true, cart: annotateCartPricing(items) });
  }

  // Session (anonyme)
  const cart = getCartSession(req);
  cart.items.push({
    id: productId || 'item_' + Date.now(),
    type,
    title,
    price: finalPrice,
    quantity,
    metadata: metadata || {}
  });
  saveCartSession(req, cart);
  res.json({ success: true, cart: annotateCartPricing(cart.items) });
}

// ============================================================
// REMOVE ITEM
// ============================================================

async function removeItem(req, res) {
  const { id } = req.params;
  const userId = req.session.userId;

  if (userId) {
    const dbId = parseInt(id.replace('db_', ''), 10);
    if (!isNaN(dbId)) {
      await db.run('DELETE FROM cart WHERE id = ? AND user_id = ?', dbId, userId);
    }
    const items = await getCartDb(userId);
    return res.json({ success: true, cart: annotateCartPricing(items) });
  }

  // Session
  const cart = getCartSession(req);
  const before = cart.items.length;
  cart.items = cart.items.filter(item => item.id !== id);
  if (cart.items.length >= before) {
    return res.status(404).json({ error: 'Article non trouve' });
  }
  saveCartSession(req, cart);
  res.json({ success: true, cart: annotateCartPricing(cart.items) });
}

// ============================================================
// APPLY BONUS PHOTO
// ============================================================
// APPLY BONUS PHOTO — desactive (plus de systeme bonus)
// ============================================================

async function applyBonusPhoto(req, res) {
  // Plus de selection manuelle — les photos gratuites sont calculees automatiquement dans get()
  res.json({ success: true, message: 'Bonus automatique' });
}

// ============================================================
// REMOVE BONUS PHOTO — desactive
// ============================================================

async function removeBonusPhoto(req, res) {
  // Plus de gestion separate du bonus
  res.json({ success: true, message: 'Bonus automatique' });
}

// ============================================================
// VALIDATE CART
// ============================================================

async function validate(req, res) {
  const userId = req.session.userId;
  let items = [];
  if (userId) {
    items = await getCartDb(userId);
  } else {
    const cart = getCartSession(req);
    const normalized = normalizeItemsPhotoPrices(cart.items || []);
    if (normalized.changed) {
      cart.items = normalized.items;
      saveCartSession(req, cart);
    }
    items = normalized.items;
  }

  if (!items.length) {
    return res.status(400).json({ error: 'Panier vide' });
  }

  // Recalculer les gratuités pour la validation
  const pricing = annotateCartPricing(items);
  res.json({ valid: true, itemCount: items.length, total: pricing.total, items: pricing.items });
}

// ============================================================
// CLEAR CART (après paiement)
// ============================================================

async function clearCart(req, res) {
  const userId = req.session.userId;

  if (userId) {
    await db.run('DELETE FROM cart WHERE user_id = ?', userId);
  } else {
    req.session.cart = { items: [], bonusUsed: false };
  }

  res.json({ success: true });
}

// ============================================================
// INTERNALS
// ============================================================

function cartTotal(cart) {
  return cart.items.reduce((sum, item) => {
    if (item.isBonus) return sum;
    return sum + item.price * (item.quantity || 1);
  }, 0);
}

function hasSkyMap(cart)  { return cart.items.some(item => item.type === 'sky_map'); }
function skyMapCount(cart){ return cart.items.filter(item => item.type === 'sky_map').length; }

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  get,
  addItem,
  removeItem,
  applyBonusPhoto,
  removeBonusPhoto,
  validate,
  clearCart,
  mergeSessionCartToDb,
  getCartDb
};
