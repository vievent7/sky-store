const { getSkyData } = require('./services/astro-engine');

async function test() {
  const skyData = await getSkyData('2024-01-15', '00:00', 45.5, -73.6);
  const stars = skyData.stars;

  let constellationsArr;
  if (!Array.isArray(skyData.constellations)) {
    constellationsArr = Object.entries(skyData.constellations || {}).map(([name, pairs]) => ({ name, pairs }));
  } else {
    constellationsArr = skyData.constellations;
  }

  const sco = constellationsArr.find(c => c.name === 'Sco');
  console.log('Sco pairs:', JSON.stringify(sco ? sco.pairs.slice(0,3) : 'not found'));

  const pair0 = sco ? sco.pairs[0] : null;
  console.log('First pair:', JSON.stringify(pair0));
  if (pair0) {
    const s1 = stars.find(s => s.name === pair0[0]);
    console.log('Star', pair0[0], 'found:', s1 ? 'YES alt=' + s1.alt : 'NO');
    console.log('All Sco stars:', stars.filter(s => s.constellation === 'Sco').map(s => s.name).join(', '));
  }
}

test().catch(console.error);
