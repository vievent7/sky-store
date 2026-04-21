/**
 * Products — Liste, creation carte du ciel, photos
 */

'use strict';

const { db } = require('../services/database');
const gallery = require('../services/photo-gallery');
const fs = require('fs');

// ============================================================
// LIST
// ============================================================

async function list(req, res) {
  const photos = gallery.getPhotos();
  const stmt = await db.prepare(
    "SELECT * FROM products WHERE type = 'sky_map' AND active = 1"
  );
  const skyMaps = stmt.all();
  const defaultPrice = 2000; // 20$ CAD — synchrone avec app.js SKY_MAP_PRICE

  res.json({ skyMaps, photos, defaultSkyMapPrice: defaultPrice });
}

// ============================================================
// CREATE SKY MAP ORDER
// ============================================================

async function createSkyMapOrder(req, res) {
  const { date, time, lat, lng, location_name, title, subtitle, style } = req.body;

  if (!date || !lat || !lng || !title) {
    return res.status(400).json({ error: 'date, lat, lng, title requis' });
  }

  const price = 2000; // 20$ CAD

  const stmt = await db.prepare(`
    INSERT INTO products (type, title, description, price, metadata, active)
    VALUES ('sky_map', ?, ?, ?, ?, 0)
  `);
  await stmt.run(
    title,
    subtitle || '',
    price,
    JSON.stringify({ date, time, lat, lng, location_name, title, subtitle, style }),
    0
  );
  const productId = stmt.lastInsertRowid;

  res.json({
    productId,
    title,
    price,
    metadata: { date, time, lat, lng, location_name, subtitle, style }
  });
}

// ============================================================
// UPDATE PHOTO (admin)
// ============================================================

async function updatePhoto(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const stmt1 = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const user = stmt1.get(req.session.userId);
  if (!user?.is_admin) return res.status(403).json({ error: 'Admin requis' });

  const { id } = req.params;
  const { title, description, price, category } = req.body;

  const updated = gallery.updatePhoto(id, { title, description, price, category });
  if (!updated) return res.status(404).json({ error: 'Photo non trouvee' });

  res.json({ success: true, photo: updated });
}

// ============================================================
// SERVE THUMBNAIL
// ============================================================

function serveThumb(req, res) {
  const thumbPath = gallery.getThumbPath(req.params.id);
  if (thumbPath && fs.existsSync(thumbPath)) {
    return res.sendFile(thumbPath);
  }
  const fullPath = gallery.getFullPath(req.params.id);
  if (fullPath && fs.existsSync(fullPath)) {
    return res.sendFile(fullPath);
  }
  return res.status(404).json({ error: 'Image non trouvee' });
}

module.exports = { list, createSkyMapOrder, updatePhoto, serveThumb };
