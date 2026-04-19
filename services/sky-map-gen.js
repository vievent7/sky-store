/**
 * SKY-MAP-GEN — Rendu visuel de la carte du ciel
 * ===============================================
 * Reçoit les données astronomiques (de astro-engine)
 * et produit une image SVG de la carte du ciel.
 *
 * Styles: 'dark' | 'light' | 'art'
 * Rendu: SVG pur (zero dépendances, fallback universelle)
 */

'use strict';

// ============================================================
// CONSTANTES DE STYLE
// ============================================================

const FONT_TITLE = 'Georgia, serif';
const FONT_BODY  = 'Helvetica, Arial, sans-serif';

// Palette sombre — produit premium imprimable
const STYLE_DARK = {
  bg: '#060c18',
  bgGrad: ['#060c18', '#0a1628', '#0f1e32'],
  sky: '#091525',
  starFill: '#ffffff',
  starGlow: '#8ab4d4',
  lineColor: 'rgba(160,200,255,0.30)',
  lineWidth: 0.7,
  textColor: '#d8e8f8',
  textMuted: '#6888aa',
  accentColor: '#4a8fd4',
  eclipticColor: 'rgba(255,220,160,0.25)',
  horizonColor: 'rgba(74,144,217,0.55)',
  borderColor: 'rgba(74,144,217,0.28)',
  cardBg: 'rgba(8,16,32,0.90)',
  cardinalColor: '#6a9acc',
  cardinalSize: 20,
  labelConstColor: 'rgba(160,200,255,0.22)',
  labelConstSize: 11,
  mwColor: 'rgba(200,215,255,0.07)',
  moonColor: '#e8e4d0',
  moonGlow: 'rgba(255,245,200,0.3)',
  gridColor: 'rgba(100,140,200,0.12)',
};

// Palette claire — style papier antiguo
const STYLE_LIGHT = {
  bg: '#f5f1e8',
  bgGrad: ['#fdf8f0', '#f0ece0'],
  sky: '#e8e4d0',
  starFill: '#000005',
  starGlow: '#8888aa',
  lineColor: 'rgba(80,80,120,0.30)',
  lineWidth: 0.6,
  textColor: '#1a1a2e',
  textMuted: '#5566aa',
  accentColor: '#3a5a8a',
  eclipticColor: 'rgba(180,140,60,0.25)',
  horizonColor: 'rgba(58,90,138,0.45)',
  borderColor: 'rgba(58,90,138,0.22)',
  cardBg: 'rgba(250,248,240,0.92)',
  cardinalColor: '#3a5a8a',
  cardinalSize: 20,
  labelConstColor: 'rgba(80,80,120,0.20)',
  labelConstSize: 11,
  mwColor: 'rgba(160,160,200,0.08)',
  moonColor: '#c8c0a0',
  moonGlow: 'rgba(180,160,80,0.25)',
  gridColor: 'rgba(80,80,120,0.10)',
};

// Palette artistique — bleu nuit profond
const STYLE_ART = {
  bg: '#080d1a',
  bgGrad: ['#080d1a', '#0d1830', '#12082a'],
  sky: '#0a1530',
  starFill: '#e8f0ff',
  starGlow: '#6688cc',
  lineColor: 'rgba(120,160,255,0.35)',
  lineWidth: 0.8,
  textColor: '#d0e8ff',
  textMuted: '#6688aa',
  accentColor: '#88aaff',
  eclipticColor: 'rgba(255,200,120,0.22)',
  horizonColor: 'rgba(136,170,255,0.50)',
  borderColor: 'rgba(136,170,255,0.25)',
  cardBg: 'rgba(10,15,40,0.90)',
  cardinalColor: '#6688cc',
  cardinalSize: 20,
  labelConstColor: 'rgba(120,160,255,0.18)',
  labelConstSize: 11,
  mwColor: 'rgba(160,180,255,0.09)',
  moonColor: '#ddd8c0',
  moonGlow: 'rgba(200,180,100,0.3)',
  gridColor: 'rgba(100,140,200,0.10)',
};

const STYLES = { dark: STYLE_DARK, light: STYLE_LIGHT, art: STYLE_ART };

// ============================================================
// GÉNÉRATION SVG
// ============================================================

function renderSkyMap(skyData, options = {}) {
  const {
    width = 800,
    height = 1000,
    style = 'dark',
    title = 'Ma Carte du Ciel',
    subtitle = '',
    locationName = '',
    backgroundImageData = null,
    tier = 'preview',  // 'preview' | 'preview_premium' | 'export'
    starsOpacity = 1,  // 0 = masquer les etoiles (quand on utilise une image capturee)
    maxStarMagnitude = 3.2, // plus bas = moins d'etoiles visibles
    maxConstellationLabels = 8 // limiter les noms de constellations affiches
  } = options;

  const S = STYLES[style] || STYLES.dark;
  const cx = width / 2;
  // mapR = min(width, height) * 0.40 — cercle a 80% de la plus petite dimension
  const mapR = Math.round(Math.min(width, height) * 0.40);
  // mapCY = height / 2 - 90 — centrage vertical simple, decale de 90px
  const mapCY = Math.round(height / 2 - 90);
  const mapTop = mapCY - mapR;
  // Scale: rapport a la base (mapR de ref = 320)
  const scale = mapR / 320;

  const stars = skyData.stars || [];
  const constellations = skyData.constellations || [];
  const monthName = skyData.monthName || '';

  // --- Fonctions utilitaires ---
  function e(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Convertit altitude/azimuth en coordonnées pixel
   * Azimuth: 0=Nord, 90=Est, 180=Sud, 270=Ouest
   */
  function altAz(alt, az) {
    const azRad = (az - 90) * Math.PI / 180;
    const altRad = Math.max(0, Math.min(90, alt)) * Math.PI / 180;
    const r = mapR * (1 - altRad / (Math.PI / 2));
    return {
      x: cx + r * Math.cos(azRad),
      y: mapCY - r * Math.sin(azRad)
    };
  }

  /**
   * Couleur de l'étoile selon sa magnitude
   * Magnitude: plus c'est negatif, plus l'étoile est brillante
   */
  function starColor(mag) {
    if (mag == null) return S.starFill;
    if (mag < 0.3)  return '#c8dcff';   // bleuté tres brillant
    if (mag < 0.8)  return '#ffffff';   // blanc pur
    if (mag < 1.5)  return '#fff4e0';   // blanc chaud
    if (mag < 2.5)  return '#ffe8b0';   // jaune clair
    if (mag < 3.5)  return '#ffcc80';   // orange clair
    if (mag < 4.5)  return '#ffaa60';   // orange
    return '#ff8840';                    // rougeatre
  }

  /**
   * Rayon de l'étoile selon sa magnitude
   */
  function starRadius(mag) {
    if (mag == null) return 1.0;
    return Math.max(0.5, Math.min(5.5, 5.5 - mag * 0.55));
  }

  // Constantes de dessin
  const dirs = [
    { a:   0, l: 'N' },
    { a:  90, l: 'E' },
    { a: 180, l: 'S' },
    { a: 270, l: 'O' }
  ];

  // Étoiles visible au-dessus de l'horizon (alt > 2°)
  const visibleStars = stars.filter((s) => {
    const mag = s.magnitude ?? s.mag ?? 99;
    return s.alt > 2 && mag <= maxStarMagnitude;
  });

  // Normaliser constellations: accepte object {name: pairs[]} ou array [{name, pairs: [from,to]}]
  let constellationsArr = constellations;
  if (!Array.isArray(constellations)) {
    constellationsArr = Object.entries(constellations || {}).map(([name, pairs]) => ({ name, pairs }));
  }

  // Construire les paires de constellations
  const constPairs = [];
  for (const c of constellationsArr) {
    for (const pair of c.pairs || []) {
      const s1 = stars.find(s => s.name === pair[0]);
      const s2 = stars.find(s => s.name === pair[1]);
      if (!s1 || !s2) continue;
      if (s1.alt < 3 || s2.alt < 3) continue;
      const m1 = s1.magnitude ?? s1.mag ?? 99;
      const m2 = s2.magnitude ?? s2.mag ?? 99;
      // On evite les lignes basees uniquement sur des etoiles tres faibles
      if (m1 > maxStarMagnitude + 0.9 && m2 > maxStarMagnitude + 0.9) continue;
      constPairs.push({ c, s1, s2 });
    }
  }

  // Calculer les noms de constellations visibles (uniques)
  const visibleConstNames = [...new Set(constPairs.map(p => p.c.name))];

  // ============================================================
  // CONSTRUCTION DU SVG
  // ============================================================
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  // ---- DEFS ----
  svg += `<defs>`;

  // Degradé de fond
  svg += `<linearGradient id="bgG" x1="0%" y1="0%" x2="0%" y2="100%">`;
  S.bgGrad.forEach((c, i) => {
    svg += `<stop offset="${(i / (S.bgGrad.length - 1)) * 100}%" stop-color="${c}"/>`;
  });
  svg += `</linearGradient>`;

  // Halo etoile brillante
  svg += `<filter id="glow" x="-150%" y="-150%" width="400%" height="400%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="${(2.5 * scale).toFixed(1)}" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

  // Halo etoile tres brillante
  svg += `<filter id="glowB" x="-200%" y="-200%" width="500%" height="500%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="${(5 * scale).toFixed(1)}" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

  // Halo planete / etoile tres lumineuse
  svg += `<filter id="glowP" x="-300%" y="-300%" width="700%" height="700%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="${(10 * scale).toFixed(1)}" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

  // Ombre cercle de la carte
  svg += `<filter id="mapShadow" x="-15%" y="-10%" width="130%" height="140%">
    <feDropShadow dx="0" dy="${(6 * scale).toFixed(1)}" stdDeviation="${(12 * scale).toFixed(1)}" flood-color="${S.accentColor}" flood-opacity="0.35"/>
  </filter>`;

  // Clip du ciel
  svg += `<clipPath id="skyClip">
    <circle cx="${cx}" cy="${mapCY}" r="${mapR - 1}"/>
  </clipPath>`;

  // Clip anneau horiz
  svg += `<clipPath id="horizClip">
    <circle cx="${cx}" cy="${mapCY}" r="${mapR + 2}"/>
    <rect x="0" y="${mapCY + mapR}" width="${width}" height="${height}"/>
  </clipPath>`;

  svg += `</defs>`;

  // ---- FOND DEGRADE ----
  svg += `<rect width="${width}" height="${height}" fill="url(#bgG)"/>`;

  // Contenu clipe au disque
  svg += `<g clip-path="url(#skyClip)">`;

  // ---- VOIE LACTEE (bande diffuse) ----
  // Position proportionnelle au centre du disque
  const viaLacteeCY = mapCY - Math.round(height * 0.025);
  for (let i = 5; i >= 0; i--) {
    const mwR = mapR * (0.3 + i * 0.09);
    const op = (0.04 - i * 0.005).toFixed(3);
    svg += `<ellipse
      cx="${cx.toFixed(1)}" cy="${viaLacteeCY.toFixed(1)}"
      rx="${(mwR * 1.1).toFixed(1)}" ry="${(mwR * 0.85).toFixed(1)}"
      fill="none"
      stroke="rgba(200,220,255,${op})"
      stroke-width="${(30 * scale + i * 10 * scale).toFixed(1)}"
      transform="rotate(${-20}, ${cx}, ${viaLacteeCY.toFixed(1)})"
      clip-path="url(#skyClip)"
      opacity="0.8"
    />`;
  }

  // ---- TITRE MOIS (centre au-dessus du cercle) ----
  if (monthName) {
    const badgeY = mapTop - 50 * scale;  // monte au-dessus du cercle
    const badgeH = 40 * scale;           // hauteur doublee
    const badgeW = 130 * scale;           // largeur doublee egalement
    svg += `<rect x="${(cx - badgeW / 2).toFixed(1)}" y="${badgeY.toFixed(1)}" width="${badgeW.toFixed(1)}" height="${badgeH.toFixed(1)}" rx="${8 * scale}" fill="${S.accentColor}" opacity="0.12"/>`;
    svg += `<text x="${cx}" y="${(badgeY + badgeH / 2 + 5 * scale).toFixed(1)}" text-anchor="middle"
      font-family="Arial,sans-serif" font-size="${Math.round(16 * scale)}" font-weight="600"
      fill="${S.textMuted}" letter-spacing="${(2.5 * scale).toFixed(1)}" opacity="0.75">${e(monthName.toUpperCase())}</text>`;
  }

  // ============================================================
  // CARTE DU CIEL (cercle)
  // ============================================================

  // Ombre portee du disque
  svg += `<circle cx="${cx}" cy="${mapCY}" r="${mapR}" fill="${S.sky}" filter="url(#mapShadow)"/>`;

  // ---- Grille altitude (cercles) ----
  [15, 30, 45, 60, 75].forEach(alt => {
    const r = mapR * (1 - alt / 90);
    svg += `<circle cx="${cx.toFixed(1)}" cy="${mapCY.toFixed(1)}" r="${r.toFixed(1)}"
      fill="none" stroke="${S.gridColor}" stroke-width="${S.lineWidth * 0.5}"/>`;
  });

  // ---- Ligne ecliptique ----
  // L'ecliptique est incliné de ~23.5° par rapport à l'équateur céleste
  // On la trace comme une série de points sur plusieurs azimuths
  for (let az = 0; az < 360; az += 5) {
    // Position approx de l'écliptique en altitude pour une latitude moyenne
    // (simplifié: maximum au sud, minimum au nord)
    const latEffect = Math.sin((az - 180) * Math.PI / 180) * 20;
    for (let alt = 5; alt <= 85; alt += 5) {
      const p = altAz(alt + latEffect, az);
      const dx = p.x - cx;
      const dy = p.y - mapCY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < mapR * 0.97) {
        const op = (0.35 * (1 - dist / mapR)).toFixed(2);
        svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="0.6"
          fill="rgba(255,220,160,${op})"/>`;
      }
    }
  }

  // ---- Etoiles ----
  for (const star of visibleStars) {
    const p = altAz(star.alt, star.az);
    const mag = star.magnitude ?? 2.5;
    const r = starRadius(mag);
    const sc = star.color || starColor(mag);

    // Ne pas dessiner si hors du cercle
    const dx = p.x - cx;
    const dy = p.y - mapCY;
    if (Math.sqrt(dx * dx + dy * dy) > mapR * 0.97) continue;

    if (mag < 0.5) {
      // Planete / etoile tres brillante — halo fort
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r * 4).toFixed(1)}"
        fill="${sc}" opacity="0.08" filter="url(#glowP)"/>`;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r * 2).toFixed(1)}"
        fill="${sc}" opacity="0.3" filter="url(#glowB)"/>`;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${sc}"/>`;
    } else if (mag < 1.5) {
      // Etoile brillante
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r * 3).toFixed(1)}"
        fill="${sc}" opacity="0.12" filter="url(#glowB)"/>`;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r * 1.5).toFixed(1)}"
        fill="${sc}" opacity="0.35" filter="url(#glow)"/>`;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${sc}"/>`;
    } else if (mag < 2.5) {
      // Etoile moyenne
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r * 2).toFixed(1)}"
        fill="${sc}" opacity="0.15" filter="url(#glow)"/>`;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r * 0.8).toFixed(1)}"
        fill="${sc}" opacity="0.6"/>`;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${sc}"/>`;
    } else if (mag < 3.5) {
      // Petite etoile visible
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r * 1.4).toFixed(1)}"
        fill="${sc}" opacity="0.18" filter="url(#glow)"/>`;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${sc}"/>`;
    } else {
      // Fond d'etoiles (tres nombreuses)
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${sc}" opacity="0.85"/>`;
    }
  }

  // ---- Lignes de constellations ----
  for (const { s1, s2 } of constPairs) {
    const p1 = altAz(s1.alt, s1.az);
    const p2 = altAz(s2.alt, s2.az);
    const dx1 = p1.x - cx, dy1 = p1.y - mapCY;
    const dx2 = p2.x - cx, dy2 = p2.y - mapCY;
    if (Math.sqrt(dx1 * dx1 + dy1 * dy1) > mapR * 0.97) continue;
    if (Math.sqrt(dx2 * dx2 + dy2 * dy2) > mapR * 0.97) continue;
    svg += `<line
      x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}"
      x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}"
      stroke="${S.lineColor}" stroke-width="${S.lineWidth}" opacity="0.75"
    />`;
  }

  // ---- Labels de constellations (discrets et limites en nombre) ----
  const labelCandidates = [];
  for (const constName of visibleConstNames) {
    const cStars = constPairs.filter(p => p.c.name === constName).flatMap(p => [p.s1, p.s2]);
    if (!cStars.length) continue;
    const validStars = cStars.filter(s => s.alt > 20);
    if (!validStars.length) continue;
    const avgAlt = validStars.reduce((a, s) => a + s.alt, 0) / validStars.length;
    const avgAz = validStars.reduce((a, s) => a + s.az, 0) / validStars.length;
    const avgMag = validStars.reduce((a, s) => a + (s.magnitude ?? s.mag ?? 4), 0) / validStars.length;
    const pLabel = altAz(Math.min(avgAlt, 80), avgAz);
    const dx = pLabel.x - cx;
    const dy = pLabel.y - mapCY;
    if (Math.sqrt(dx * dx + dy * dy) > mapR * 0.80) continue;
    labelCandidates.push({ constName, pLabel, avgMag, weight: validStars.length });
  }

  const labelsToDraw = labelCandidates
    .sort((a, b) => (a.avgMag - b.avgMag) || (b.weight - a.weight))
    .slice(0, Math.max(0, maxConstellationLabels));

  for (const label of labelsToDraw) {
    const constName = label.constName;
    const pLabel = label.pLabel;
    // Traductions fr
    const nameFr = {
      'Orion': 'Orion', 'Grande Ourse': 'Grande Ourse', 'Petite Ourse': 'Petite Ourse',
      'Lyre': 'Lyre', 'Cygne': 'Cygne', 'Scorpion': 'Scorpion', 'Cassiopee': 'Cassiopee',
      'Gemeaux': 'Gemeaux', 'Taureau': 'Taureau', 'Lion': 'Lion',
      'Vierge': 'Vierge', 'Sagittaire': 'Sagittaire', 'Aigle': 'Aigle',
      'Bouvier': 'Bouvier', 'Hercule': 'Hercule',
      'Ori': 'Orion', 'UMa': 'Grde Ourse', 'UMi': 'Ptite Ourse',
      'CMa': 'Grd Chien', 'CMi': 'Ptit Chien', 'Lyr': 'Lyre',
      'Cyg': 'Cygne', 'Tau': 'Taureau', 'Gem': 'Gemeaux',
      'Leo': 'Lion', 'Sco': 'Scorpion', 'Cas': 'Cassiopee',
      'Aql': 'Aigle', 'Sgr': 'Sagittaire', 'Vir': 'Vierge',
      'Ari': 'Belier', 'Psc': 'Poissons', 'Cap': 'Capricorne',
      'Aqr': 'Verseau', 'Per': 'Perse', 'Dra': 'Dragon',
      'Cen': 'Centaure', 'Car': 'Carene', 'Col': 'Colombe',
      'Lep': 'Lievre', 'And': 'Andromede', 'Peg': 'Pegasus',
      'CrB': 'Couronne', 'Oph': 'Ophiuchus', 'Her': 'Hercule',
      'Lup': 'Loup', 'Tri': 'Triangle', 'Boo': 'Bouvier',
      'Aur': 'Cocher', 'Boo': 'Bouvier', 'PsA': 'Poisson Austral',
      'Cet': 'Baleine', 'Eri': 'Eridan', 'Gru': 'Grue',
    }[constName] || constName;
    svg += `<text
      x="${pLabel.x.toFixed(1)}" y="${pLabel.y.toFixed(1)}"
      text-anchor="middle" dominant-baseline="middle"
      font-family="Arial,sans-serif" font-size="${Math.round(S.labelConstSize * scale)}"
      fill="${S.labelConstColor}"
      opacity="0.9"
    >${e(nameFr)}</text>`;
  }

  // ---- Ligne d'horizon (étoiles tres basses) ----
  for (let az = 0; az < 360; az += 2) {
    const p = altAz(1, az);
    const dx = p.x - cx, dy = p.y - mapCY;
    if (Math.sqrt(dx * dx + dy * dy) < mapR * 0.97) {
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="0.5"
        fill="${S.starFill}" opacity="0.12"/>`;
    }
  }

  svg += `</g>`; // fin clip

  // ---- Anneau de l'horizon ----
  svg += `<circle cx="${cx}" cy="${mapCY}" r="${mapR}"
    fill="none" stroke="${S.horizonColor}" stroke-width="1.5"/>`;
  svg += `<circle cx="${cx}" cy="${mapCY}" r="${mapR - 3}"
    fill="none" stroke="${S.borderColor}" stroke-width="0.6"/>`;
  svg += `<circle cx="${cx}" cy="${mapCY}" r="${mapR + 2}"
    fill="none" stroke="${S.borderColor}" stroke-width="0.8"/>`;

  // ---- Points cardinaux sur l'anneau ----
  dirs.forEach(({ a }) => {
    const rad = (a - 90) * Math.PI / 180;
    const px = cx + (mapR + 5) * Math.cos(rad);
    const py = mapCY - (mapR + 5) * Math.sin(rad);
    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(2.5 * scale).toFixed(1)}"
      fill="${S.cardinalColor}" opacity="0.8"/>`;
    svg += `<text
      x="${px.toFixed(1)}" y="${(py + 6 * scale).toFixed(1)}"
      text-anchor="middle"
      font-family="Arial,sans-serif" font-size="${Math.round(S.cardinalSize * scale)}" font-weight="700"
      fill="${S.cardinalColor}"
    >${a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : 'O'}</text>`;
  });

  // ---- Petites graduation sur l'anneau ----
  [15, 30, 45, 60, 75, 105, 120, 135, 150, 165, 195, 210, 225, 240, 255, 285, 300, 315, 330, 345].forEach(a => {
    const rad = (a - 90) * Math.PI / 180;
    const pi = cx + (mapR + 2) * Math.cos(rad);
    const py = mapCY - (mapR + 2) * Math.sin(rad);
    svg += `<circle cx="${pi.toFixed(1)}" cy="${py.toFixed(1)}" r="${scale.toFixed(1)}"
      fill="${S.cardinalColor}" opacity="0.3"/>`;
  });

  // ============================================================
  // INFORMATIONS SOUS LE CERCLE
  // ============================================================
  const infoY = mapCY + mapR + 52 * scale;
  svg += `<line x1="${(cx - 160 * scale).toFixed(1)}" y1="${(infoY - 8 * scale).toFixed(1)}" x2="${(cx + 160 * scale).toFixed(1)}" y2="${(infoY - 8 * scale).toFixed(1)}"
    stroke="${S.borderColor}" stroke-width="${(0.6 * scale).toFixed(1)}"/>`;

  if (locationName) {
    svg += `<text x="${cx}" y="${(infoY + 4 * scale).toFixed(1)}"
      text-anchor="middle"
      font-family="Georgia,serif" font-size="${Math.round(20 * scale)}" font-weight="600"
      fill="${S.textColor}">${e(locationName)}</text>`;
  }

  if (skyData.lat != null) {
    const latStr = `${Math.abs(skyData.lat).toFixed(4)}° ${skyData.lat >= 0 ? 'N' : 'S'}`;
    const lngStr = `${Math.abs(skyData.lng).toFixed(4)}° ${skyData.lng >= 0 ? 'E' : 'O'}`;
    svg += `<text x="${cx}" y="${(infoY + 28 * scale).toFixed(1)}"
      text-anchor="middle"
      font-family="Arial,sans-serif" font-size="${Math.round(15 * scale)}"
      fill="${S.textMuted}" opacity="0.7">${latStr} · ${lngStr}</text>`;
  }

  svg += `<line x1="${(cx - 80 * scale).toFixed(1)}" y1="${(infoY + 38 * scale).toFixed(1)}" x2="${(cx + 80 * scale).toFixed(1)}" y2="${(infoY + 38 * scale).toFixed(1)}"
    stroke="${S.borderColor}" stroke-width="${(0.4 * scale).toFixed(1)}"/>`;

  // ============================================================
  // BLOC TITRE EN BAS
  // ============================================================
  const titleY = infoY + 98 * scale;
  const titlePadX = 36 * scale;
  const titleW = width - 72 * scale;
  svg += `<rect x="${titlePadX.toFixed(1)}" y="${(titleY - 30 * scale).toFixed(1)}" width="${titleW.toFixed(1)}" height="${86 * scale}" rx="${10 * scale}" fill="${S.cardBg}"/>`;
  svg += `<rect x="${titlePadX.toFixed(1)}" y="${(titleY - 30 * scale).toFixed(1)}" width="${titleW.toFixed(1)}" height="${2 * scale}" rx="${scale}" fill="${S.accentColor}" opacity="0.5"/>`;

  if (title) {
    svg += `<text x="${cx}" y="${(titleY - 5 * scale).toFixed(1)}"
      text-anchor="middle"
      font-family="Georgia,serif" font-size="${Math.round(28 * scale)}" font-weight="bold"
      fill="${S.textColor}">${e(title)}</text>`;
  }
  if (subtitle) {
    svg += `<text x="${cx}" y="${(titleY + 16 * scale).toFixed(1)}"
      text-anchor="middle"
      font-family="Georgia,serif" font-size="${Math.round(19 * scale)}" font-style="italic"
      fill="${S.textMuted}">${e(subtitle)}</text>`;
  }
  if (skyData.date) {
    const d = new Date(skyData.date + 'T12:00:00');
    const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    svg += `<text x="${cx}" y="${(titleY + 54 * scale).toFixed(1)}"
      text-anchor="middle"
      font-family="Arial,sans-serif" font-size="${Math.round(15 * scale)}"
      fill="${S.textMuted}" opacity="0.75">${dateStr}${skyData.time ? ' · ' + e(skyData.time) : ''}</text>`;
  }

  // ---- Branding / Filigrane selon le tier ----
  if (tier === 'preview') {
    svg = addPreviewWatermark(svg, width, height, S);
  } else if (tier === 'preview_premium') {
    svg = addPremiumWatermark(svg, width, height, S);
  } else if (tier === 'export') {
    // Export final: pas de filigrane, branding minimal
    const bw = Math.round(width * 0.012);
    svg += `<text x="${width - 18}" y="${height - 14}"
      text-anchor="end"
      font-family="Arial,sans-serif" font-size="${bw}"
      fill="${S.textMuted}" opacity="0.20">Sky Store</text>`;
  }

  svg += '</svg>';
  return Buffer.from(svg, 'utf-8');
}

// ============================================================
// FILIGRANES
// ============================================================

/**
 * Filigrane discret pour le preview standard
 */
function addPreviewWatermark(svg, width, height, S) {
  const opacity = '0.38';
  const fontSize = Math.round(width * 0.018);
  const x = width - 20;
  const y = height - 16;
  svg += `<text x="${x}" y="${y}"
    text-anchor="end"
    font-family="Arial,sans-serif" font-size="${fontSize}"
    fill="${S.textMuted}" opacity="${opacity}">Sky Store</text>`;
  return svg;
}

/**
 * Filigrane diagonal répété pour le preview premium
 * Plus visible: opacité 20%, texte plus grand
 */
function addPremiumWatermark(svg, width, height, S) {
  const wmText = 'SKY STORE';
  const fontSize = Math.round(width * 0.022);
  const tileW = Math.round(width * 0.30);
  const tileH = Math.round(height * 0.13);
  const opacity = '0.20';
  const textColor = S.textMuted || '#6888aa';

  // Pattern SVG tileable en diagonale
  svg += `<defs>
    <pattern id="wmTile" x="0" y="0" width="${tileW}" height="${tileH}"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(-30)">
      <text x="0" y="${fontSize}"
        font-family="Arial,sans-serif" font-size="${fontSize}"
        font-weight="900" letter-spacing="${Math.round(fontSize * 0.7)}"
        fill="${textColor}" opacity="${opacity}">${wmText}</text>
    </pattern>
  </defs>`;

  // Recouvrir toute l'image avec le pattern
  svg += `<rect width="${width}" height="${height}" fill="url(#wmTile)"/>`;
  return svg;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = { renderSkyMap, addPreviewWatermark, addPremiumWatermark };
