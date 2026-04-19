/**
 * Test checkout flow - run with: node scripts/test-checkout.js
 * Tests: create order + items + verify in DB
 */
'use strict';

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const SQL = require('sql.js');
const fs = require('fs');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'sky-store.db');

async function main() {
  const sqljs = await SQL();
  const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  const db = buf ? new sqljs.Database(buf) : new sqljs.Database();

  // Simulate what createCheckout does
  const userId = 17; // Patrick's user ID

  // Step 1: Insert order
  db.run(`INSERT INTO orders (user_id, status, total, free_photo_credit) VALUES (?, 'pending', 2000, 1)`, [userId]);
  const orderId1 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  console.log('Order inserted, lastInsertRowid =', orderId1);

  // Step 2: Insert item with this orderId
  db.run(`INSERT INTO order_items (order_id, product_type, product_title, price, is_bonus, metadata) VALUES (?, 'sky_map', 'Test Carte', 2000, 0, '{}')`, [orderId1]);
  const itemId1 = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  console.log('Item inserted, lastInsertRowid =', itemId1);

  // Step 3: Verify
  const orderCheck = db.exec('SELECT * FROM orders WHERE id = ' + orderId1);
  const itemCheck = db.exec('SELECT * FROM order_items WHERE order_id = ' + orderId1);
  console.log('\nOrder in DB:', orderCheck[0] ? orderCheck[0].columns : 'NOT FOUND');
  console.log('Items in DB for order', orderId1 + ':', itemCheck[0] ? itemCheck[0].values.length : 'NOT FOUND');

  // Step 4: Try MAX(id) approach
  db.run(`INSERT INTO orders (user_id, status, total) VALUES (?, 'pending', 3000)`, [userId]);
  const maxId = db.exec('SELECT MAX(id) as id FROM orders')[0].values[0][0];
  console.log('\nMAX(id) approach, maxId =', maxId);

  // Persist
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('\nDB saved.');
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
