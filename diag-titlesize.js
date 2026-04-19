const fs = require('fs');
const c = fs.readFileSync('C:/Users/vieve/.openclaw/workspace/sky-store/templates/final-preview.html', 'utf8');

// Find buildCardHtml call with validatedCardHtml
const idx = c.indexOf('validatedCardHtml = buildCardHtml');
if (idx >= 0) {
  console.log('Call site:');
  console.log(JSON.stringify(c.substring(idx, idx+200)));
} else {
  console.log('NOT FOUND - searching differently...');
  const idx2 = c.indexOf('validatedCardHtml:');
  console.log('validatedCardHtml:', idx2);
}

// Also check addToCart
const idx3 = c.indexOf('addToCart(');
if (idx3 >= 0) {
  console.log('\naddToCart call:');
  console.log(JSON.stringify(c.substring(idx3, idx3+300)));
}
