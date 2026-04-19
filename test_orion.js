const fs = require('fs');
const { getSkyData } = require('./services/astro-engine');
const { renderSkyMap } = require('./services/sky-map-gen');

async function test() {
  const skyData = await getSkyData('2024-01-15', '00:00', 45.5, -73.6);

  const buf = renderSkyMap(skyData, {
    width: 800, height: 1000, style: 'dark',
    title: 'Test Orion',
    locationName: 'Montreal'
  });

  fs.writeFileSync('test_orion.svg', buf);
  const svg = fs.readFileSync('test_orion.svg', 'utf8');

  // Check for constellation line elements (should be <line> elements)
  const lineCount = (svg.match(/<line /g) || []).length;
  console.log('Line elements (constellation lines):', lineCount);

  // Check for Orion-specific content
  console.log('Has Orion text:', svg.includes('Orion'));
  console.log('Has Orion line:', svg.includes('Orion') || svg.includes('Ori'));

  // Find all text elements
  const texts = svg.match(/<text[^>]*>([^<]+)<\/text>/g) || [];
  console.log('Total text elements:', texts.length);
  texts.forEach(t => {
    const m = t.match(/>([^<]+)</);
    if (m && m[1].length > 1 && m[1].length < 30) {
      console.log('  TEXT:', m[1]);
    }
  });

  // Count circles (stars)
  const circles = (svg.match(/<circle /g) || []).length;
  console.log('Circle elements:', circles);

  // Check for "fill" attributes that indicate bright stars (larger circles)
  const bigCircles = (svg.match(/r="[3-9]\./g) || []).length;
  console.log('Big circles (r > 3):', bigCircles);
  const medCircles = (svg.match(/r="2\.[0-9]"/g) || []).length;
  console.log('Medium circles (r ~2):', medCircles);

  console.log('Done!');
}

test().catch(console.error);
