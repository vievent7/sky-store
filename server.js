/**
 * SKY STORE â€” Serveur principal
 * ==============================
 * Express + Sessions + SQLite + Stripe ready
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const session    = require('express-session');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const { v4: uuidv4 } = require('uuid');

// --- Services ---
const { db, initDb } = require('./services/database');
const { geocodeLocation }          = require('./services/astro-engine');
const { generateSkyMapPDF }       = require('./services/pdf-export');
const { createCheckoutSession, getSessionStatus, constructWebhookEvent } = require('./services/stripe-service');
const { sendEmail, orderConfirmationEmail } = require('./services/email-service');
const gallery = require('./services/photo-gallery');

// --- Variables d'environnement ---
const PORT        = process.env.PORT || 3000;
const NODE_ENV    = process.env.NODE_ENV || 'development';
const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, 'storage');
const ADMIN_CODE   = process.env.ADMIN_CODE || 'admin123';
const BASE_URL     = process.env.BASE_URL || `http://localhost:${PORT}`;

function resolveSphereOptions(starDensity, showConstellationLabels) {
  const density = String(starDensity || 'normal').toLowerCase();
  let maxStarMagnitude = 3.2;
  let maxConstellationLabels = 8;
  if (density === 'minimal') {
    maxStarMagnitude = 2.6;
    maxConstellationLabels = 4;
  } else if (density === 'dense') {
    maxStarMagnitude = 4.0;
    maxConstellationLabels = 12;
  }
  if (showConstellationLabels === false || showConstellationLabels === 'false') {
    maxConstellationLabels = 0;
  }
  return { maxStarMagnitude, maxConstellationLabels };
}

// --- Repositories (Data Access) ---
const Users      = require('./routes/users');
const Products   = require('./routes/products');
const Cart      = require('./routes/cart');
const Orders    = require('./routes/orders');

// --- App ---
const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());

// â”€â”€ Stripe Webhook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Doit etre AVANT express.json() car Stripe a besoin du body brut pour verifier la signature
// NB: le secret STRIPE_WEBHOOK_SECRET doit etre configure dans .env
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || webhookSecret === 'whsec_YOUR_WEBHOOK_SECRET_HERE') {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET non configure dans .env');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = constructWebhookEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Webhook] Erreur signature:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // â”€â”€ checkout.session.completed = paiement reussi â”€â”€
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('[Webhook] checkout.session.completed â€” session:', session.id, '| payment_status:', session.payment_status);

    // Rechercher la commande associee
    const sOrder = await db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?');
    const order = sOrder.get(session.id);

    if (!order) {
      console.error('[Webhook] Commande introuvable pour session:', session.id);
      return res.status(200).json({ received: true, error: 'order not found' });
    }

    if (order.status === 'paid' || order.status === 'delivered') {
      console.log('[Webhook] Commande', order.id, 'deja finalisee (status:', order.status, ')');
      return res.status(200).json({ received: true });
    }

    console.log('[Webhook] Finalisation de la commande', order.id);
    await Orders.finalizeOrder(order.id, order.user_id);
  }

  res.status(200).json({ received: true });
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/storage/previews', express.static(path.join(__dirname, 'storage', 'previews')));
app.use('/storage/preview', express.static(path.join(__dirname, 'storage', 'previews')));

// D3-Celestial vendor files
app.use('/vendor/d3-celestial', express.static(path.join(__dirname, 'node_modules/d3-celestial')));
app.use('/vendor/d3-lib', express.static(path.join(__dirname, 'node_modules/d3-celestial/lib')));

// IMPORTANT: ne pas exposer STORAGE_PATH complet publiquement.
// Les fichiers prives sont accessibles uniquement via /api/download/:token.

// Session (memory store pour dev, Redis recommended en prod)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
  }
}));

// ============================================================
// INIT
// ============================================================

// Creer les repertoires de storage
for (const dir of ['generated', 'downloads', 'thumbnails', 'previews', 'private'].map(d => path.join(STORAGE_PATH, d))) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Scan photos au demarrage
gallery.syncPhotos().then(() => {
  console.log(`[Gallery] ${gallery.getPhotos().length} photos chargees`);
}).catch(console.warn);

// Seed photos depuis le dossier (deja fait via gallery.syncPhotos() ci-dessus)

// ============================================================
// ROUTES PUBLIQUES
// ============================================================

// --- Pages HTML ---
const templates = path.join(__dirname, 'templates');
app.get('/',               (req, res) => res.sendFile(path.join(templates, 'index.html')));
app.get('/create-map',     (req, res) => res.sendFile(path.join(templates, 'create-map.html')));
app.get('/choose-sky',    (req, res) => res.sendFile(path.join(templates, 'choose-sky.html')));
app.get('/build-map',     (req, res) => res.sendFile(path.join(templates, 'build-map.html')));
app.get('/final-preview', (req, res) => res.sendFile(path.join(templates, 'final-preview.html')));
app.get('/gallery',        (req, res) => res.sendFile(path.join(templates, 'gallery.html')));
app.get('/cart',           (req, res) => {
  if (!req.session.userId) return res.redirect('/login?next=/cart');
  res.sendFile(path.join(templates, 'cart.html'));
});
app.get('/checkout',       (req, res) => res.sendFile(path.join(templates, 'checkout.html')));
app.get('/success',        (req, res) => res.sendFile(path.join(templates, 'success.html')));
app.get('/cancel',         (req, res) => res.sendFile(path.join(templates, 'cancel.html')));
app.get('/login',          (req, res) => res.sendFile(path.join(templates, 'login.html')));
app.get('/register',       (req, res) => res.sendFile(path.join(templates, 'register.html')));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(templates, 'forgot-password.html')));
app.get('/reset-password',  (req, res) => res.sendFile(path.join(templates, 'reset-password.html')));
app.get('/verify-email',    (req, res) => res.sendFile(path.join(templates, 'verify-email.html')));
app.get('/account',        (req, res) => {
  if (!req.session.userId) return res.redirect('/login?next=/account');
  res.sendFile(path.join(templates, 'account.html'));
});
app.get('/downloads',      (req, res) => {
  if (!req.session.userId) return res.redirect('/login?next=/downloads');
  res.sendFile(path.join(templates, 'downloads.html'));
});
app.get('/admin',          Users.adminRequired, (req, res) => res.sendFile(path.join(templates, 'admin.html')));
app.get('/cgu',            (req, res) => res.sendFile(path.join(templates, 'cgu.html')));
app.get('/privacy',        (req, res) => res.sendFile(path.join(templates, 'privacy.html')));

// ============================================================
// API ROUTES
// ============================================================

// --- Auth ---
app.post('/api/auth/register',    Users.register);
app.post('/api/auth/login',       Users.login);
app.post('/api/auth/logout',      Users.logout);
app.get('/api/auth/me',           Users.me);
app.get('/api/auth/verify-email', Users.verifyEmail);
app.post('/api/auth/resend-verification', Users.resendVerification);
app.post('/api/auth/forgot-password', Users.forgotPassword);
app.post('/api/auth/reset-password', Users.resetPassword);

// --- Geocodage (accessible a tous pour l'apercu de carte) ---
app.get('/api/geo', async (req, res) => {
  try {
    const { location } = req.query;
    if (!location) return res.status(400).json({ error: 'location requis' });
    const coords = await geocodeLocation(location);
    res.json(coords);
  } catch (e) {
    res.status(500).json({ error: 'Geocodage echoue', details: e.message });
  }
});

// --- Apercu carte du ciel tiers 1: preview standard (libre) ---
app.post('/api/sky-map/preview', async (req, res) => {
  try {
    const { date, time, lat, lng, location_name, title, subtitle, style, orientation, backgroundImageUrl, starDensity, showConstellationLabels } = req.body;
    const { getSkyData } = require('./services/astro-engine');
    const { renderSkyMap } = require('./services/sky-map-gen');
    const path = require('path');
    const fs = require('fs');

    if (!date || !lat || !lng) {
      return res.status(400).json({ error: 'date, lat, lng requis' });
    }

    const isVertical = orientation !== 'horizontal';
    const w = isVertical ? 800 : 1000;
    const h = isVertical ? 1000 : 800;

    const skyData = await getSkyData(date, time || '21:00', lat, lng);

    // Ajouter monthName
    const d = new Date(date + 'T12:00:00');
    const MONTHS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
    skyData.monthName = MONTHS[d.getMonth()] || '';

    // Harmoniser les noms de champs pour le renderer
    skyData.lat = lat;
    skyData.lng = lng;
    skyData.stars = (skyData.stars || []).map(s => ({
      ...s,
      altitude: s.alt,
      azimuth:  s.az
    }));
    skyData.constellations = Object.entries(skyData.constellations || {}).map(([name, pairs]) => ({
      name,
      pairs: pairs.map(p => [p[0], p[1]])
    }));

    // Encoder l'image de fond en data URI si specifiee
    let backgroundImageData = null;
    if (backgroundImageUrl) {
      if (backgroundImageUrl.startsWith('data:')) {
        // Data URL direct (capture D3-Celestial en base64)
        backgroundImageData = backgroundImageUrl;
      } else {
        // Chemin fichier local
        const imgPath = backgroundImageUrl.startsWith('/')
          ? path.join(__dirname, 'public', backgroundImageUrl)
          : backgroundImageUrl;
        if (fs.existsSync(imgPath)) {
          const ext = path.extname(imgPath).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          const data = fs.readFileSync(imgPath);
          backgroundImageData = `data:${mime};base64,${data.toString('base64')}`;
        }
      }
    }

    const sphere = resolveSphereOptions(starDensity, showConstellationLabels);

    // Generer le SVG â€” TIER 1: preview standard (libre, chargement rapide)
    let svgBuffer = renderSkyMap(skyData, {
      width: w, height: h,
      style: style || 'dark',
      title: title || 'Ma Carte du Ciel',
      subtitle: subtitle || '',
      locationName: location_name || '',
      backgroundImageData,
      tier: 'preview',
      maxStarMagnitude: sphere.maxStarMagnitude,
      maxConstellationLabels: sphere.maxConstellationLabels
    });

    // Si fond specifie, l'injecter dans le SVG
    if (backgroundImageData) {
      let svgStr = svgBuffer.toString('utf-8');
      // Coordonnees carte selon orientation
      const mapCX = w / 2;
      const mapR = Math.round(Math.min(w, h) * 0.40);
      const mapCY = Math.round(h / 2 - 90);
      const vigStart = (mapR * 0.68 / (mapR + 2)) * 100;
      const bgInject = `<defs>
        <radialGradient id="bgVig" cx="50%" cy="50%" r="50%">
          <stop offset="${vigStart.toFixed(1)}%" stop-color="transparent"/>
          <stop offset="62%" stop-color="rgba(0,0,0,0.10)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.65)"/>
        </radialGradient>
        <mask id="bgMask">
          <rect width="${w}" height="${h}" fill="white"/>
          <circle cx="${mapCX}" cy="${mapCY}" r="${mapR + 2}" fill="black"/>
        </mask>
      </defs>`;
      svgStr = svgStr.replace('</defs>', bgInject + '</defs>');
      svgStr = svgStr.replace(`<rect width="${w}" height="${h}" fill="url(#bgG)"/>`,
        `<rect width="${w}" height="${h}" fill="url(#bgG)"/>
         <rect width="${w}" height="${h}" fill="url(#bgVig)" mask="url(#bgMask)"/>
         <image href="${backgroundImageData}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" mask="url(#bgMask)"/>`);
      svgBuffer = Buffer.from(svgStr, 'utf-8');
    }

    const dataUrl = `data:image/svg+xml;base64,${svgBuffer.toString('base64')}`;
    res.set('Content-Type', 'application/json');
    res.json({ svgDataUrl: dataUrl, tier: 'preview', orientation });
  } catch (e) {
    res.status(500).json({ error: 'Generation carte echouee', details: e.message });
  }
});

// --- Apercu carte du ciel tiers 2: preview premium (grand format, filigrane diagonal) ---
app.post('/api/sky-map/preview-premium', async (req, res) => {
  try {
    const { date, time, lat, lng, location_name, title, subtitle, style, backgroundImageUrl, starDensity, showConstellationLabels } = req.body;
    const { getSkyData } = require('./services/astro-engine');
    const { renderSkyMap } = require('./services/sky-map-gen');
    const path = require('path');
    const fs = require('fs');

    if (!date || !lat || !lng) {
      return res.status(400).json({ error: 'date, lat, lng requis' });
    }

    const skyData = await getSkyData(date, time || '21:00', lat, lng);

    const d = new Date(date + 'T12:00:00');
    const MONTHS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
    skyData.monthName = MONTHS[d.getMonth()] || '';
    skyData.lat = lat;
    skyData.lng = lng;
    skyData.stars = (skyData.stars || []).map(s => ({ ...s, altitude: s.alt, azimuth: s.az }));
    skyData.constellations = Object.entries(skyData.constellations || {}).map(([name, pairs]) => ({
      name,
      pairs: pairs.map(p => [p[0], p[1]])
    }));

    let backgroundImageData = null;
    if (backgroundImageUrl) {
      const imgPath = backgroundImageUrl.startsWith('/')
        ? path.join(__dirname, 'public', backgroundImageUrl)
        : backgroundImageUrl;
      if (fs.existsSync(imgPath)) {
        const ext = path.extname(imgPath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
        const data = fs.readFileSync(imgPath);
        backgroundImageData = `data:${mime};base64,${data.toString('base64')}`;
      }
    }

    const sphere = resolveSphereOptions(starDensity, showConstellationLabels);

    // TIER 2: preview premium â€” 1600x2000, filigrane diagonal rÃ©pÃ©tÃ©
    let svgBuffer = renderSkyMap(skyData, {
      width: 1600, height: 2000,
      style: style || 'dark',
      title: title || 'Ma Carte du Ciel',
      subtitle: subtitle || '',
      locationName: location_name || '',
      backgroundImageData,
      tier: 'preview_premium',
      maxStarMagnitude: sphere.maxStarMagnitude,
      maxConstellationLabels: sphere.maxConstellationLabels
    });

    if (backgroundImageData) {
      let svgStr = svgBuffer.toString('utf-8');
      // Coordonnees carte pour 1600x2000 (preview premium)
      const mapCX = 800, mapCY = 910, mapR = 640;
      const vigStart = (mapR * 0.68 / (mapR + 2)) * 100;
      const bgInject = `<defs>
        <radialGradient id="bgVig" cx="50%" cy="50%" r="50%">
          <stop offset="${vigStart.toFixed(1)}%" stop-color="transparent"/>
          <stop offset="62%" stop-color="rgba(0,0,0,0.10)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.65)"/>
        </radialGradient>
        <mask id="bgMask">
          <rect width="1600" height="2000" fill="white"/>
          <circle cx="${mapCX}" cy="${mapCY}" r="${mapR + 2}" fill="black"/>
        </mask>
      </defs>`;
      svgStr = svgStr.replace('</defs>', bgInject + '</defs>');
      svgStr = svgStr.replace('<rect width="1600" height="2000" fill="url(#bgG)"/>',
        `<rect width="1600" height="2000" fill="url(#bgG)"/>
         <rect width="1600" height="2000" fill="url(#bgVig)" mask="url(#bgMask)"/>
         <image href="${backgroundImageData}" x="0" y="0" width="1600" height="2000" preserveAspectRatio="xMidYMid slice" mask="url(#bgMask)"/>`);
      svgBuffer = Buffer.from(svgStr, 'utf-8');
    }

    const dataUrl = `data:image/svg+xml;base64,${svgBuffer.toString('base64')}`;
    res.set('Content-Type', 'application/json');
    res.json({ svgDataUrl: dataUrl, tier: 'preview_premium' });
  } catch (e) {
    res.status(500).json({ error: 'Generation carte echouee', details: e.message });
  }
});

// --- Galerie photos ---
app.get('/api/photos',            (req, res) => res.json(gallery.getPhotos(req.query)));
app.get('/api/photos/:id',        (req, res) => res.json(gallery.getPhoto(req.params.id)));
app.put('/api/photos/:id',        Products.updatePhoto); // admin/auth
app.get('/api/photos/:id/thumb',  Products.serveThumb);

// --- Fonds de carte (dossier statique, pas vendus) ---
app.get('/api/card-backgrounds',   (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const bgDir = path.join(__dirname, 'public', 'images-gallery', 'card-backgrounds');
  if (!fs.existsSync(bgDir)) return res.json({ backgrounds: [] });
  const files = fs.readdirSync(bgDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
  const backgrounds = files.map(f => {
    const name = path.basename(f, path.extname(f));
    return {
      id: name,
      filename: f,
      thumbUrl: '/images-gallery/card-backgrounds/' + f,
      fullUrl: '/images-gallery/card-backgrounds/' + f
    };
  });
  res.json({ backgrounds });
});

// --- Produits (cartes du ciel config + liste photos) ---
app.get('/api/products',          Products.list);
app.post('/api/products/sky-map', Products.createSkyMapOrder);

// --- Panier (sessions) ---
app.get('/api/cart',              Cart.get);
app.post('/api/cart/items',        Cart.addItem);
app.delete('/api/cart/items/:id',  Cart.removeItem);
app.post('/api/cart/apply-bonus',  Cart.applyBonusPhoto);
app.delete('/api/cart/bonus',     Cart.removeBonusPhoto);
app.post('/api/cart/validate',    Cart.validate);
app.delete('/api/cart',           Cart.clearCart);

// --- Sauvegarde carte validee ---
app.post('/api/card/save', Orders.saveCardFiles);

// --- Paiement ---
app.post('/api/checkout',          Orders.createCheckout);
app.get('/api/checkout/status',   Orders.checkStatus);

// --- Telechargement securise ---
app.get('/api/download/:token',   Orders.downloadFile);

// --- Commandes ---
app.get('/api/orders',             Orders.listForUser); // client
app.get('/api/orders/:id',        Orders.getOne);
app.delete('/api/orders/:id',      Orders.deleteOrder);

// --- Admin ---
app.get('/api/admin/orders',      Users.adminRequired, Orders.listAll); // filtre: ?status=&from=&to=
app.post('/api/admin/orders/:id/deliver', Users.adminRequired, Orders.markDelivered);
app.get('/api/admin/order-items/:itemId/open', Users.adminRequired, Orders.adminOpenOrderItem);
app.get('/api/admin/order-items/:itemId/download', Users.adminRequired, Orders.adminDownloadOrderItem);
app.get('/api/admin/stats',        Users.adminRequired, Orders.adminStats);
app.get('/api/admin/users',        Users.adminRequired, Users.adminList);
app.get('/api/admin/users/:id',    Users.adminRequired, Users.adminGetUser);
app.post('/api/admin/products/scan', async (req, res) => {
  const force = req.query.force === 'true';
  await gallery.syncPhotos(force);
  res.json({ success: true, photos: gallery.getPhotos().length });
});

// ============================================================
// START
// ============================================================

// Start server only after DB is ready
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`
â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘           SKY STORE â€” Started            â•‘
â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£
â•‘  URL:       ${BASE_URL.padEnd(32)}â•‘
â•‘  Mode:     ${NODE_ENV.padEnd(32)}â•‘
â•‘  Stripe:   ${(require('./services/stripe-service').isMock() ? 'SIMULATION' : 'REEL').padEnd(32)}â•‘
â•‘  Email:    ${(require('./services/email-service').isMock() ? 'SIMULATION' : 'REEL').padEnd(32)}â•‘
â•‘  Photos:   ${String(gallery.getPhotos().length).padEnd(32)}â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
`);
  });
}).catch(err => {
  console.error('Echec du demarrage:', err);
  process.exit(1);
});

