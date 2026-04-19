const { db } = require('./services/database');
(async () => {
  const s = await db.prepare('SELECT 1');
  s.free();
  const raw = db.rawSql();

  // Check recent sky_map items for titles containing accented chars
  const r = raw.exec(`
    SELECT oi.id, oi.order_id, oi.product_title, oi.metadata
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_type = 'sky_map' AND o.user_id = 17
    ORDER BY oi.id DESC LIMIT 5
  `);

  r[0] && r[0].values.forEach(v => {
    const meta = JSON.parse(v[3] || '{}');
    const title = meta.title || '(none)';
    console.log('Item', v[0], '(order', v[1], '):');
    console.log('  title (raw):', title);
    console.log('  title (JSON):', JSON.stringify(title));
    console.log('  first char bytes:', title.charCodeAt(0), title.charCodeAt(1), title.charCodeAt(2));
  });
  process.exit(0);
})();
