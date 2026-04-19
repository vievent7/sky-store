const { getSkyData } = require('./services/astro-engine');

async function debug() {
  const skyData = await getSkyData('2024-08-15', '21:00', 45.5, -73.6);
  console.log('Total stars:', skyData.stars.length);

  // Show stars by constellation
  const byConst = {};
  for (const s of skyData.stars) {
    const c = s.constellation;
    if (!byConst[c]) byConst[c] = [];
    byConst[c].push({ name: s.name, alt: s.alt, az: s.az, mag: s.mag });
  }
  const consts = Object.keys(byConst).sort();
  console.log('Constellations visible:', consts.length, consts.join(', '));

  // Show Orion stars
  const orion = byConst['Ori'];
  if (orion) {
    console.log('\nOrion stars:');
    orion.forEach(s => console.log(' ', s.name, 'alt:', s.alt, 'az:', s.az, 'mag:', s.mag));
  } else {
    console.log('\nNo Orion stars visible!');
  }

  // Check constellations object
  console.log('\nConstellation keys:', Object.keys(skyData.constellations).join(', '));
  const oriPairs = skyData.constellations['Orion'];
  console.log('Orion pairs:', oriPairs ? oriPairs.length : 'none');
}

debug().catch(console.error);
