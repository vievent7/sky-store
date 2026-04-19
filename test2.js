const fs = require('fs');
const { getSkyData } = require('./services/astro-engine');
const { renderSkyMap } = require('./services/sky-map-gen');

async function test() {
  const skyData = await getSkyData('2024-01-15', '00:00', 45.5, -73.6);
  const buf = renderSkyMap(skyData, { width: 800, height: 1000, style: 'dark', title: 'Test', locationName: 'Mtl' });
  fs.writeFileSync('test2.svg', buf);
  const svg = fs.readFileSync('test2.svg', 'utf8');

  // Extract all text node contents using a simpler approach
  const re = />\s*([^<]+?)\s*<\//g;
  const texts = [];
  let m;
  while ((m = re.exec(svg)) !== null) {
    const t = m[1].trim();
    if (t) texts.push(t);
  }
  console.log('All text nodes:', texts.length);
  texts.forEach(t => console.log(' ', JSON.stringify(t)));

  // Count lines
  const lines = (svg.match(/<line /g) || []).length;
  console.log('Lines:', lines);

  // Count circles by radius
  const circlesByR = {};
  const radiusRe = /r="([0-9.]+)"/g;
  while ((m = radiusRe.exec(svg)) !== null) {
    const r = parseFloat(m[1]);
    const bucket = r < 1 ? '<1' : r < 2 ? '1-2' : r < 3 ? '2-3' : r < 5 ? '3-5' : '5+';
    circlesByR[bucket] = (circlesByR[bucket] || 0) + 1;
  }
  console.log('Circles by radius:', circlesByR);

  console.log('Total SVG bytes:', svg.length);
}

test().catch(console.error);
