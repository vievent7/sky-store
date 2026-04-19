const fs = require('fs');
const { getSkyData } = require('./services/astro-engine');
const { renderSkyMap } = require('./services/sky-map-gen');

async function test() {
  const skyData = await getSkyData('2024-01-15', '00:00', 45.5, -73.6);

  // Test the normalization
  const constellations = skyData.constellations;
  let constellationsArr;
  if (!Array.isArray(constellations)) {
    constellationsArr = Object.entries(constellations || {}).map(([name, pairs]) => ({ name, pairs }));
  } else {
    constellationsArr = constellations;
  }
  console.log('CA keys:', constellationsArr.map(c => c.name).join(', '));

  const stars = skyData.stars;
  const constPairs = [];
  for (const c of constellationsArr) {
    for (const pair of c.pairs || []) {
      const s1 = stars.find(s => s.name === pair[0]);
      const s2 = stars.find(s => s.name === pair[1]);
      if (!s1 || !s2) continue;
      if (s1.alt < 3 || s2.alt < 3) continue;
      constPairs.push({ c });
    }
  }
  const visibleConstNames = [...new Set(constPairs.map(p => p.c.name))];
  console.log('visibleConstNames:', visibleConstNames.join(', '));

  // Test the nameFr lookup
  const nameFr = {
    Ori: 'Orion', UMa: 'Grde Ourse', UMi: 'Ptite Ourse',
    CMa: 'Grd Chien', CMi: 'Ptit Chien', Lyr: 'Lyre',
    Cyg: 'Cygne', Tau: 'Taureau', Gem: 'Gemeaux',
    Leo: 'Lion', Sco: 'Scorpion', Cas: 'Cassiopee',
    Aql: 'Aigle', Sgr: 'Sagittaire', Vir: 'Vierge',
    Ari: 'Belier', Psc: 'Poissons', Cap: 'Capricorne',
    Aqr: 'Verseau', Per: 'Perse', Dra: 'Dragon',
    Cen: 'Centaure', Car: 'Carene', Col: 'Colombe',
    Lep: 'Lievre', And: 'Andromede', Peg: 'Pegasus',
    CrB: 'Couronne', Oph: 'Ophiuchus', Her: 'Hercule',
    Lup: 'Loup', Tri: 'Triangle', Boo: 'Bouvier',
    Aur: 'Cocher', PsA: 'Poisson Austral',
    Cet: 'Baleine', Eri: 'Eridan', Gru: 'Grue',
  };

  for (const cn of visibleConstNames) {
    console.log('  Lookup', cn, '->', nameFr[cn] || 'UNDEFINED');
  }

  // Now check what's ACTUALLY in the SVG after renderSkyMap
  const buf = renderSkyMap(skyData, { width: 800, height: 1000, style: 'dark', title: 'X', locationName: 'X' });
  const svg = buf.toString('utf8');

  // The labels should appear as <text> elements. Let's look for ANY font-size="11" text
  const texts11 = svg.match(/<text[^>]*font-size="11"[^>]*>([^<]+)<\/text>/g) || [];
  console.log('\nfont-size="11" texts:', texts11.length);
  texts11.forEach(t => console.log(' ', t));

  // What font sizes are used?
  const fontSizes = svg.match(/font-size="[^"]+"/g) || [];
  const unique = [...new Set(fontSizes)];
  console.log('\nUnique font sizes:', unique.join(', '));

  // Is there a section for constellation labels?
  const hasLabelConstSize = svg.includes('labelConstSize');
  console.log('Has labelConstSize in SVG:', hasLabelConstSize);

  // Check if there's a clip-path issue preventing labels from showing
  const clipPathId = svg.match(/clip-path="url\([^)]+\)"/g) || [];
  console.log('\nClip paths used:', clipPathId.length);
}

test().catch(console.error);
