const { getSkyData } = require('./services/astro-engine');
const { renderSkyMap } = require('./services/sky-map-gen');
const fs = require('fs');

async function test() {
  // January at midnight - Orion is high in the sky
  const skyData = await getSkyData('2024-01-15', '00:00', 45.5, -73.6);
  console.log('January stars visible:', skyData.stars.length);

  const byConst = {};
  for (const s of skyData.stars) {
    const c = s.constellation;
    if (!byConst[c]) byConst[c] = [];
    byConst[c].push(s);
  }
  const orion = byConst['Ori'] || [];
  console.log('Orion stars:', orion.length, orion.map(s => s.name).join(', '));
  console.log('Constellations:', Object.keys(byConst).sort().join(', '));

  const buf = renderSkyMap(skyData, {
    width: 800, height: 1000, style: 'dark',
    title: 'Nuit d\'hiver sous les etoiles',
    subtitle: '15 janvier 2024, Montreal',
    locationName: 'Montreal, QC'
  });

  fs.writeFileSync('test_map_winter.svg', buf);
  const svg = fs.readFileSync('test_map_winter.svg', 'utf8');

  // Check for constellation labels
  const texts = svg.match(/<text[^>]*font-size=\"11\"[^>]*>([^<]+)<\/text>/g) || [];
  console.log('\nConstellation labels in SVG:');
  texts.forEach(t => console.log(' ', t));
  console.log('\nTotal SVG bytes:', svg.length);
  console.log('Total circles:', (svg.match(/<circle/g) || []).length);
  console.log('SUCCESS!');
}

test().catch(console.error);
