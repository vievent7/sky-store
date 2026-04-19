/**
 * PDF-EXPORT — Export PDF haute resolution
 * ========================================
 * 1. Genere le SVG de la carte
 * 2. Convertit SVG → PNG via sharp
 * 3. Integre le PNG dans un PDF via pdfkit
 */

'use strict';

const { renderSkyMap } = require('./sky-map-gen');
const { getSkyData } = require('./astro-engine');
const path = require('path');
const fs = require('fs');

let PDFDocument;
try {
  PDFDocument = require('pdfkit');
} catch (e) {
  PDFDocument = null;
}

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  sharp = null;
}

/**
 * @param {object} options
 * @returns {Promise<{pdfPath: string, imagePath: string}>}
 *
 * Options:
 *   date, time, lat, lng, locationName, title, subtitle, style
 *   svgDataUrl  — si fourni, utilise ce SVG pre-genere (meme rendu que le preview)
 *   orientation — 'vertical' ou 'horizontal' (utilise pour renderSkyMap si svgDataUrl absent)
 */
async function generateSkyMapPDF(options) {
  const {
    date,
    time,
    lat,
    lng,
    locationName,
    title,
    subtitle = '',
    style = 'dark',
    svgDataUrl = null,   // SVG pre-genere (来自 preview认同)
    orientation = 'vertical',
    outputPath = null
  } = options;

  let svgBuffer;
  let skyData = null;
  const resolvedLocationName = locationName || options.location_name || '';

  if (svgDataUrl) {
    // === UTILISER LE SVG DEJA APPROUVÉ (MEME RENDU QUE LE PREVIEW) ===
    //svgDataUrl format: "data:image/svg+xml;base64,..."
    const commaIdx = svgDataUrl.indexOf(',');
    const b64 = svgDataUrl.substring(commaIdx + 1);
    svgBuffer = Buffer.from(b64, 'base64');
  } else {
    // === GENERER LE SVG (fallback — peut differer du preview) ===
    skyData = await getSkyData(date, time, lat, lng);
    svgBuffer = renderSkyMap(skyData, {
      width: 2400,
      height: 3300,
      style,
      title,
      subtitle,
      locationName: resolvedLocationName,
      orientation,
      tier: 'export'
    });
  }

  const storageDir = path.join(process.env.STORAGE_PATH || './storage', 'generated');
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

  // 3. Convertir SVG → PNG via sharp
  const imgFileName = `sky_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.png`;
  const imgPath = path.join(storageDir, imgFileName);

  if (sharp) {
    await sharp(svgBuffer)
      .resize(2400, 3300, { fit: 'contain', background: style === 'light' ? '#ffffff' : '#060c18' })
      .png({ quality: 95 })
      .toFile(imgPath);
  } else {
    // Fallback: sauvegarder le SVG si sharp non disponible
    fs.writeFileSync(imgPath.replace('.png', '.svg'), svgBuffer);
  }

  // 4. Generer le PDF
  let pdfPath = null;
  if (PDFDocument && fs.existsSync(imgPath)) {
    const pdfFileName = imgFileName.replace('.png', '.pdf');
    pdfPath = path.join(storageDir, pdfFileName);

    try {
      await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        // Page 1: carte
        doc.image(imgPath, 0, 0, { fit: [595.28, 841.89], align: 'center' });

        // Page 2: details
        doc.addPage();
        doc.fontSize(22).font('Helvetica-Bold').fillColor('#1a2a4a')
          .text('Ma Carte du Ciel', { align: 'center' });
        doc.moveDown();
        doc.fontSize(13).font('Helvetica').fillColor('#333')
          .text(`Titre: ${title}`, { align: 'center' });
        if (subtitle) doc.text(`Sous-titre: ${subtitle}`, { align: 'center' });
        doc.moveDown();
        doc.text(`Lieu: ${resolvedLocationName}`, { align: 'center' });
        doc.text(`Coordonnees: ${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`, { align: 'center' });
        doc.moveDown();
        doc.text(`Date: ${date}`, { align: 'center' });
        doc.text(`Heure: ${time}`, { align: 'center' });
        doc.moveDown();
        if (skyData && Array.isArray(skyData.stars)) {
          doc.fontSize(10).fillColor('#888')
            .text(`${skyData.stars.length} etoiles | Sky Store`, { align: 'center' });
        } else {
          doc.fontSize(10).fillColor('#888')
            .text('Sky Store', { align: 'center' });
        }

        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
      });
      // Verifier que le PDF a ete vraiment ecrit
      if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size === 0) {
        console.warn('[PDF] Fichier PDF vide apres generation, suppression:', pdfPath);
        try { fs.unlinkSync(pdfPath); } catch(_) {}
        pdfPath = null;
      }
    } catch (e) {
      console.error('[PDF] Erreur generation PDF:', e.message);
      try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch(_) {}
      pdfPath = null;
    }
  }

  return { pdfPath, imagePath: imgPath, skyData };
}

module.exports = { generateSkyMapPDF };
