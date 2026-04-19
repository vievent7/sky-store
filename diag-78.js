const { db } = require('./services/database');
(async () => {
  const s = await db.prepare('SELECT 1');
  s.free();
  const raw = db.rawSql();

  // Order 78 details
  const r = raw.exec('SELECT id, status, user_id, total FROM orders WHERE id = 78');
  console.log('Order 78:', r[0] ? r[0].values[0] : 'not found');

  // Items for order 78
  const r2 = raw.exec('SELECT id, product_type, metadata FROM order_items WHERE order_id = 78');
  if (r2[0]) {
    r2[0].values.forEach(v => {
      const meta = JSON.parse(v[2] || '{}');
      console.log('Item', v[0], ': type=', v[1], 'cardPreviewId=', meta.cardPreviewId || '(null)');
    });
  }

  // Download tokens for order 78
  const r3 = raw.exec('SELECT token, order_item_id FROM download_tokens WHERE order_id = 78');
  console.log('Tokens for order 78:', r3[0] ? r3[0].values.length : 0);
  r3[0] && r3[0].values.forEach(v => console.log('  token:', v[0].substring(0, 10), 'item:', v[1]));

  process.exit(0);
})();
