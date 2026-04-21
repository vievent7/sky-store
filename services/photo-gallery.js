/**
 * PHOTO-GALLERY — Gestion de la galerie photos
 * ==========================================
 * - Scan automatique du dossier /public/images-astro/
 * - Generation automatique des miniatures
 * - Conservation des metadonnees existantes dans photos-meta.json
 * - CRUD simple sur les photos
 *
 * UTILISATION:
 *   node scripts/scan-photos.js   — Scan manuel + regeneration miniatures
 *   const gallery = require('./services/photo-gallery');
 *   await gallery.init();         — Initialisation (scan auto au demarrage du serveur)
 *   gallery.getPhotos();           — Liste complete des photos
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PHOTOS_DIR = path.join(__dirname, '..', 'public', 'images-astro');
const THUMBS_DIR = path.join(process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage'), 'thumbnails');
const META_FILE  = path.join(__dirname, '..', 'data', 'photos-meta.json');
const DEFAULT_PHOTO_PRICE = 1000; // 10$ CAD
const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();

function shouldGenerateThumbsByDefault() {
  const env = String(process.env.GALLERY_GENERATE_THUMBS_ON_STARTUP || '').trim().toLowerCase();
  if (env === 'true' || env === '1' || env === 'yes') return true;
  if (env === 'false' || env === '0' || env === 'no') return false;
  // In production, avoid long/heavy thumbnail generation during cold start.
  return NODE_ENV !== 'production';
}

function normalizePrice(price, fallback = DEFAULT_PHOTO_PRICE) {
  const n = Number(price);
  if (Number.isFinite(n) && n >= 0) return Math.round(n);
  return fallback;
}

// ============================================================
// GESTION DES MINIATURES (avec node-canvas ou sharp si dispo)
// ============================================================

let sharp = null;
try { sharp = require('sharp'); } catch (e) {}

async function generateThumbnail(inputPath, outputPath) {
  if (sharp) {
    await sharp(inputPath)
      .resize(600, 400, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(outputPath);
  } else {
    // Fallback: copier le fichier original si sharp non dispo
    fs.copyFileSync(inputPath, outputPath);
    console.warn('[Gallery] sharp non disponible — miniature = copie du fichier original');
  }
}

// ============================================================
// GESTION DES METADONNEES
// ============================================================

/** Charge les metadonnees depuis photos-meta.json */
function loadMeta() {
  if (!fs.existsSync(META_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

/** Sauvegarde les metadonnees */
function saveMeta(meta) {
  const dataDir = path.dirname(META_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

/** Charge la configuration des categories */
function loadCategories() {
  const catFile = path.join(__dirname, '..', 'data', 'categories.json');
  if (!fs.existsSync(catFile)) {
    return ['Nébuleuses', 'Galaxies', 'Amas', 'Voie lactée', 'Orion', 'Ciel profond'];
  }
  try {
    return JSON.parse(fs.readFileSync(catFile, 'utf8'));
  } catch (e) {
    return [];
  }
}

// ============================================================
// SCAN ET SYNC
// ============================================================

/**
 * Scan le dossier photos et synchronise les miniatures + metadonnees.
 * Appele automatiquement a l'init.
 * @param {boolean} forceRegenerateThumbs - Force la regeneration des miniatures
 */
async function syncPhotos(forceRegenerateThumbs = false) {
  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  }
  if (!fs.existsSync(THUMBS_DIR)) {
    fs.mkdirSync(THUMBS_DIR, { recursive: true });
  }

  const meta = loadMeta();
  const files = fs.readdirSync(PHOTOS_DIR).filter(f =>
    /\.(jpg|jpeg|png|webp)$/i.test(f)
  );

  const seen = new Set();

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const baseName = path.basename(file, ext);
    const id = baseName; // utilise le nom de fichier comme ID stable
    seen.add(id);

    const thumbPath = path.join(THUMBS_DIR, baseName + '_thumb.jpg');
    const fullPath  = path.join(PHOTOS_DIR, file);

    // Initialiser les metadonnees si nouvelle photo
    if (!meta[id]) {
      meta[id] = {
        id,
        filename: file,
        title: baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: '',
        price: DEFAULT_PHOTO_PRICE, // 10$ par defaut
        priceExplicit: false,
        category: '',
        active: true,
        addedAt: new Date().toISOString()
      };
    } else {
      // Migration legacy: ancien "prix par defaut" 1500 -> 1000
      // sauf si le prix a ete explicitement defini.
      const explicit = meta[id].priceExplicit === true;
      const current = normalizePrice(meta[id].price);
      if (!explicit && current === 1500) {
        meta[id].price = DEFAULT_PHOTO_PRICE;
        meta[id].priceExplicit = false;
      } else {
        meta[id].price = current;
        if (typeof meta[id].priceExplicit !== 'boolean') {
          meta[id].priceExplicit = explicit;
        }
      }
    }

    // Generer la miniature si absente/forcee, but avoid heavy cold-start work in production by default.
    const shouldGenerateThumb = shouldGenerateThumbsByDefault() || forceRegenerateThumbs;
    if (shouldGenerateThumb && (!fs.existsSync(thumbPath) || forceRegenerateThumbs)) {
      try {
        await generateThumbnail(fullPath, thumbPath);
        console.log(`[Gallery] miniature generee: ${baseName}`);
      } catch (e) {
        console.warn(`[Gallery] Erreur miniature ${file}: ${e.message}`);
      }
    }
  }

  // Supprimer les metadonnees des photos effacees
  for (const id of Object.keys(meta)) {
    if (!seen.has(id)) {
      const thumbPath = path.join(THUMBS_DIR, id + '_thumb.jpg');
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      delete meta[id];
    }
  }

  saveMeta(meta);
  return meta;
}

// ============================================================
// API PUBLIQUE
// ============================================================

/** Liste de toutes les photos actives */
function getPhotos(filters = {}) {
  const meta = loadMeta();
  let photos = Object.values(meta).filter(p => p.active);

  if (filters.category) {
    photos = photos.filter(p => p.category === filters.category);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    photos = photos.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  }

  return photos.map(p => ({
    ...p,
    price: normalizePrice(p.price),
    imageUrl: '/images-astro/' + p.filename,
    thumbUrl: '/images-astro/' + p.filename
  }));
}

/** Get single photo by id */
function getPhoto(id) {
  const meta = loadMeta();
  const p = meta[id];
  if (!p) return null;
  return {
    ...p,
    price: normalizePrice(p.price),
    imageUrl: '/images-astro/' + p.filename,
    thumbUrl: '/images-astro/' + p.filename
  };
}

/** Mise a jour des metadonnees d'une photo */
function updatePhoto(id, updates) {
  const meta = loadMeta();
  if (!meta[id]) return null;
  const normalizedUpdates = { ...updates };
  if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'price')) {
    normalizedUpdates.price = normalizePrice(normalizedUpdates.price, normalizePrice(meta[id].price));
    normalizedUpdates.priceExplicit = true;
  }
  meta[id] = { ...meta[id], ...normalizedUpdates, id }; // preserve id
  meta[id].price = normalizePrice(meta[id].price);
  saveMeta(meta);
  return meta[id];
}

/** Supprime une photo (desactive) */
function deletePhoto(id) {
  const meta = loadMeta();
  if (!meta[id]) return false;
  meta[id].active = false;
  saveMeta(meta);
  return true;
}

/** Chemin de la miniature */
function getThumbPath(id) {
  const meta = loadMeta();
  const p = meta[id];
  if (!p) return null;
  return path.join(THUMBS_DIR, path.basename(p.filename).replace(/\.[^.]+$/, '') + '_thumb.jpg');
}

/** Chemin de l'image full */
function getFullPath(id) {
  const meta = loadMeta();
  const p = meta[id];
  if (!p) return null;
  return path.join(PHOTOS_DIR, p.filename);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  syncPhotos,
  getPhotos,
  getPhoto,
  updatePhoto,
  deletePhoto,
  getThumbPath,
  getFullPath,
  THUMBS_DIR,
  PHOTOS_DIR
};
