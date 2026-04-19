const { db } = require('./services/database');
(async () => {
  const s = await db.prepare('SELECT 1');
  s.free();
  const raw = db.rawSql();
  // All sky_map items, most recent first
  const r = raw.exec(`
    SELECT oi.id, oi.order_id, oi.product_title, oi.metadata, o.status, o.created_at
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_type = 'sky_map'
    ORDER BY oi.id DESC LIMIT 20
  `);
  console.log('Recent sky_map orders:');
  if (!r[0]) { console.log('  (none)'); process.exit(0); }
  r[0].values.forEach(v => {
    const m = JSON.parse(v[3] || '{}');
    console.log('  item:', v[0], '| order:', v[1], '| status:', v[4], '| cardPreviewId:', m.cardPreviewId || '(null)', '| bg:', (m.backgroundImageUrl || 'none').split('/').pop());
  });
  process.exit(0);
})();
