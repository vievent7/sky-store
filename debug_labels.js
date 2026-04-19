const { getSkyData } = require('./services/astro-engine');

async function debug() {
  const skyData = await getSkyData('2024-01-15', '00:00', 45.5, -73.6);
  console.log('Total stars:', skyData.stars.length);

  // Build constellationsArr (same as in sky-map-gen)
  let constellationsArr;
  if (!Array.isArray(skyData.constellations)) {
    constellationsArr = Object.entries(skyData.constellations || {}).map(([name, pairs]) => ({ name, pairs }));
  } else {
    constellationsArr = skyData.constellations;
  }

  const stars = skyData.stars;
  const constPairs = [];
  for (const c of constellationsArr) {
    for (const pair of c.pairs || []) {
      const s1 = stars.find(s => s.name === pair[0]);
      const s2 = stars.find(s => s.name === pair[1]);
      if (!s1 || !s2) continue;
      if (s1.alt < 3 || s2.alt < 3) continue;
      constPairs.push({ c, s1, s2 });
    }
  }

  const visibleConstNames = [...new Set(constPairs.map(p => p.c.name))];
  console.log('visibleConstNames:', visibleConstNames.join(', '));
  console.log('constPairs count:', constPairs.length);

  const mapR = 320;
  const cx = 400;
  const mapCY = 410;

  function altAz(alt, az) {
    const azRad = (az - 90) * Math.PI / 180;
    const altRad = Math.max(0, Math.min(90, alt)) * Math.PI / 180;
    const r = mapR * (1 - altRad / (Math.PI / 2));
    return { x: cx + r * Math.cos(azRad), y: mapCY - r * Math.sin(azRad) };
  }

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
    'Aur': 'Cocher', 'PsA': 'Poisson Austral', 'Cet': 'Baleine', 'Eri': 'Eridan', 'Gru': 'Grue',
  };

  for (const constName of visibleConstNames) {
    const cStars = constPairs.filter(p => p.c.name === constName).flatMap(p => [p.s1, p.s2]);
    const validStars = cStars.filter(s => s.alt > 20);
    if (!validStars.length) { console.log('  SKIP', constName, '- no stars > 20deg'); continue; }
    const avgAlt = validStars.reduce((a, s) => a + s.alt, 0) / validStars.length;
    const avgAz = validStars.reduce((a, s) => a + s.az, 0) / validStars.length;
    const pLabel = altAz(Math.min(avgAlt, 80), avgAz);
    const dx = pLabel.x - cx, dy = pLabel.y - mapCY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ok = dist < mapR * 0.80;
    console.log(' ', constName, '-> avgAlt:', avgAlt.toFixed(1), 'avgAz:', avgAz.toFixed(1), 'dist:', dist.toFixed(1), 'max:', (mapR * 0.80).toFixed(1), 'OK:', ok, '=>', nameFr[constName] || constName);
  }
}

debug().catch(console.error);
