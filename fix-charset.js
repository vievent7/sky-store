const fs = require('fs'), p = require('path');
const BASE = 'C:/Users/vieve/.openclaw/workspace/sky-store';
const privateDir = p.join(BASE, 'storage', 'private');
const files = fs.readdirSync(privateDir).filter(f => f.endsWith('_clean.html'));
let fixed = 0;
files.forEach(f => {
  const fp = p.join(privateDir, f);
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes('charset=UTF-8')) return;
  c = c.replace('<head>\n  <meta name="viewport"', '<head>\n  <meta charset="UTF-8">\n  <meta name="viewport"');
  c = c.replace('<head>\n  <meta charset="UTF-8">', ''); // avoid double
  fs.writeFileSync(fp, c, 'utf8');
  fixed++;
  console.log('Fixed:', f);
});
console.log('Total fixed:', fixed);
