const { db } = require('./services/database');
(async () => {
  const s = await db.prepare('SELECT 1');
  s.free();
  const raw = db.rawSql();
  // All cart items for user 17
  const r = raw.exec('SELECT id, product_type, product_title, metadata FROM cart WHERE user_id = 17 ORDER BY id DESC');
  console.log('Current cart items for user 17:');
  if (!r[0]) { console.log('  (empty)'); process.exit(0); }
  r[0].values.forEach(v => {
    const m = JSON.parse(v[3] || '{}');
    console.log('  cart id:', v[0], '| type:', v[1], '| title:', v[2], '| cardPreviewId:', m.cardPreviewId || '(null)', '| bg:', m.backgroundImageUrl || '(none)');
  });
  process.exit(0);
})();
