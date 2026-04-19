const { db } = require('./services/database');
const fs = require('fs');
const p = require('path');

(async () => {
  const s = await db.prepare('SELECT 1');
  s.free();
  const raw = db.rawSql();

  // Trouver les orders avec "l" dans le titre (léa ou laura ou autre)
  const r = raw.exec(`
    SELECT oi.id, oi.order_id, oi.product_title, oi.metadata
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_type = 'sky_map' AND o.user_id = 17
    AND (oi.product_title LIKE '%l%' OR oi.metadata LIKE '%l%')
    ORDER BY oi.id DESC LIMIT 10
  `);

  r[0] && r[0].values.forEach(v => {
    const meta = JSON.parse(v[3] || '{}');
    const title = meta.title || v[2] || '(none)';
    console.log('Item', v[0], '(order', v[1], '):');
    console.log('  product_title:', JSON.stringify(v[2]));
    console.log('  meta.title:', JSON.stringify(meta.title));
    console.log('  raw bytes:', Buffer.from(title).toString('hex'));
    // Check the clean file
    const cardId = meta.cardPreviewId;
    if (cardId) {
      const fp = p.join(process.cwd(), 'storage', 'private', cardId + '_clean.html');
      if (fs.existsSync(fp)) {
        const c = fs.readFileSync(fp, 'utf8');
        const idx = c.indexOf(title);
        if (idx >= 0) {
          console.log('  title found in clean file at', idx);
        } else {
          // Search for the title text
          const search = title.charAt(0);
          console.log('  title char[0]="', search, '" hex=', Buffer.from(search).toString('hex'));
          // Find where the title actually appears
          for (let j = 0; j < c.length; j++) {
            if (c.substring(j, j+3) === 'Lé_' || c.substring(j, j+3) === 'lé_') {
              console.log('  found accent text at', j, ':', c.substring(j-5, j+15));
            }
          }
        }
      } else {
        console.log('  clean file: NOT FOUND');
      }
    }
  });
  process.exit(0);
})();
