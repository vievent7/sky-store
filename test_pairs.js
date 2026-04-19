const { getSkyData } = require('./services/astro-engine');

async function test() {
  const skyData = await getSkyData('2024-01-15', '00:00', 45.5, -73.6);
  const stars = skyData.stars;

  // Mimic what renderSkyMap does
  let constellationsArr;
  if (!Array.isArray(skyData.constellations)) {
    constellationsArr = Object.entries(skyData.constellations || {}).map(([name, pairs]) => ({ name, pairs }));
  } else {
    constellationsArr = skyData.constellations;
  }

  console.log('constellationsArr keys:', constellationsArr.map(c => c.name).join(', '));

  const constPairs = [];
  for (const c of constellationsArr) {
    for (const pair of c.pairs || []) {
      const s1 = stars.find(s => s.name === pair[0]);
      const s2 = stars.find(s => s.name === pair[1]);
      if (!s1 || !s2) {
        console.log('MISS:', pair[0], 'or', pair[1], 'not found');
        continue;
      }
      if (s1.alt < 3 || s2.alt < 3) {
        console.log('LOW ALT:', pair[0], s1.alt, pair[1], s2.alt);
        continue;
      }
      constPairs.push({ cName: c.name, s1Name: s1.name, s2Name: s2.name });
    }
  }

  console.log('constPairs count:', constPairs.length);
  console.log('First 5 pairs:', constPairs.slice(0, 5).map(p => p.cName + ':' + p.s1Name + '-' + p.s2Name).join(', '));

  const visibleConstNames = [...new Set(constPairs.map(p => p.cName))];
  console.log('visibleConstNames:', visibleConstNames.join(', '));
}

test().catch(console.error);
