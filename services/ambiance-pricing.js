'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AMBIANCE_UNIT_PRICE = 199;
const AMBIANCE_PACK_5_PRICE = 799;
const AMBIANCE_PACK_10_PRICE = 999;

const AMBIANCE_DIR = path.join(__dirname, '..', 'public', 'images-gallery', 'card-backgrounds');

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function extractAmbianceKeyFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  const direct = metadata.ambianceId || metadata.ambienceId || metadata.id || metadata.slug;
  if (direct) return normalizeKey(direct);

  const imageLike = metadata.backgroundImageUrl || metadata.imageUrl || metadata.thumbUrl || metadata.url;
  if (imageLike) {
    const base = path.basename(String(imageLike));
    if (base) return normalizeKey(base);
  }
  return '';
}

function calculateAmbiancePriceDistribution(count) {
  const n = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  const prices = [];
  let remaining = n;

  while (remaining >= 10) {
    prices.push(AMBIANCE_PACK_10_PRICE);
    for (let i = 0; i < 9; i++) prices.push(0);
    remaining -= 10;
  }

  if (remaining >= 5) {
    prices.push(AMBIANCE_PACK_5_PRICE);
    for (let i = 0; i < 4; i++) prices.push(0);
    remaining -= 5;
  }

  for (let i = 0; i < remaining; i++) {
    prices.push(AMBIANCE_UNIT_PRICE);
  }

  return prices;
}

function buildAmbianceLibrary() {
  if (!fs.existsSync(AMBIANCE_DIR)) return [];
  const files = fs.readdirSync(AMBIANCE_DIR)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  return files.map((fileName) => {
    const title = path.basename(fileName, path.extname(fileName)).replace(/[_-]+/g, ' ');
    return {
      ambianceId: fileName,
      title: title || fileName,
      backgroundImageUrl: '/images-gallery/card-backgrounds/' + fileName
    };
  });
}

function stableShuffle(items, seed) {
  return items
    .map((it) => {
      const h = crypto.createHash('sha1').update(seed + '|' + it.ambianceId).digest('hex');
      return { it, h };
    })
    .sort((a, b) => a.h.localeCompare(b.h))
    .map((v) => v.it);
}

function selectBonusAmbiances({ count, excludedKeys, seed }) {
  const wanted = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  if (wanted <= 0) return [];
  const excluded = new Set((excludedKeys || []).map(normalizeKey).filter(Boolean));
  const library = buildAmbianceLibrary().filter((a) => !excluded.has(normalizeKey(a.ambianceId)));
  const shuffled = stableShuffle(library, String(seed || 'default-seed'));
  return shuffled.slice(0, wanted);
}

module.exports = {
  AMBIANCE_UNIT_PRICE,
  AMBIANCE_PACK_5_PRICE,
  AMBIANCE_PACK_10_PRICE,
  calculateAmbiancePriceDistribution,
  extractAmbianceKeyFromMetadata,
  selectBonusAmbiances
};

