const fs = require('fs'), p = require('path');
const dir = 'C:/Users/vieve/.openclaw/workspace/sky-store/storage/private';
const files = fs.readdirSync(dir).filter(f => f.endsWith('_clean.html')).sort().slice(-5);
files.forEach(f => {
  const fp = dir + '/' + f;
  const c = fs.readFileSync(fp, 'utf8');
  // Find titles - look for font-size style near top
  const titleMatch = c.match(/font-size:[0-9.]+rem[^>]*>([^<]{2,30})</);
  if (titleMatch) {
    const t = titleMatch[1];
    console.log(f + ' title="' + t + '" hex=' + Buffer.from(t).toString('hex'));
  }
});
