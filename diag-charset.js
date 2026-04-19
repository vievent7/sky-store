const fs = require('fs');
const c = fs.readFileSync('C:/Users/vieve/.openclaw/workspace/sky-store/templates/final-preview.html', 'utf8');
console.log('First 400 chars:');
console.log(JSON.stringify(c.substring(0, 400)));
console.log('\nHas charset?:', c.includes('charset'));
console.log('\ncharset tag:', c.match(/<meta charset[^>]*>/gi));
