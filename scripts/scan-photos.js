/**
 * Script de scan manuel des photos
 * Usage: node scripts/scan-photos.js
 * ou: npm run scan-photos
 */

require('dotenv').config();
const gallery = require('../services/photo-gallery');

console.log('Debut du scan des photos...');

gallery.syncPhotos(true).then(meta => {
  const photos = Object.values(meta);
  console.log('\nPhotos detectees : ' + photos.length);
  photos.forEach(p => {
    console.log('  - [' + p.id + '] ' + p.title + ' (' + (p.category || 'sans categorie') + ') — ' + p.price / 100 + '$');
  });
  console.log('\nMiniatures generez dans : ' + gallery.THUMBS_DIR);
  console.log('Done.');
}).catch(err => {
  console.error('Erreur:', err.message);
  process.exit(1);
});
