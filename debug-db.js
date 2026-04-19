const fs = require('fs');
const SQL = require('sql.js');

(async () => {
  const DB_PATH = 'C:\\Users\\vieve\\.openclaw\\workspace\\sky-store\\data\\sky-store.db';
  const S = await SQL();
  const db = new S.Database(fs.readFileSync(DB_PATH));

  const r = db.exec('SELECT id, user_id, product_type, metadata FROM cart WHERE user_id = 17');
  console.log('cart items:', r[0]?.columns, JSON.stringify(r[0]?.values));

  const r2 = db.exec('SELECT id, user_id, status FROM orders WHERE user_id = 17 ORDER BY id DESC LIMIT 3');
  console.log('recent orders:', r2[0]?.values);

  db.close();
})();
