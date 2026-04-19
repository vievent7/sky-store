/**
 * Script de réparation: Recopie les items depuis le panier de l'user
 * vers les commandes qui n'ont pas d'items.
 * Usage: node scripts/repair-orders.js
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

  console.log('=== Réparation des commandes Sky Store ===\n');

  // 1. Trouver les commandes sans items
  const ordersWithoutItems = db.exec(`
    SELECT o.id, o.user_id, o.total, o.status, o.created_at
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.id IS NULL AND o.status = 'paid'
    ORDER BY o.id DESC
  `);

  if (!ordersWithoutItems.length || !ordersWithoutItems[0].values.length) {
    console.log('Aucune commande sans items trouvée.');
    db.close();
    return;
  }

  const cols = ordersWithoutItems[0].columns;
  const rows = ordersWithoutItems[0].values;
  console.log(`${rows.length} commande(s) sans items:\n`);

  for (const row of rows) {
    const order = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
    console.log(`Commande #${order.id} (user_id=${order.user_id}, total=${order.total}, status=${order.status})`);

    // Chercher les items du panier de cet user
    const cartItems = db.exec(`
      SELECT * FROM cart WHERE user_id = ${order.user_id} ORDER BY id ASC
    `);

    if (cartItems.length && cartItems[0].values.length) {
      const cartCols = cartItems[0].columns;
      for (const cartRow of cartItems[0].values) {
        const cart = Object.fromEntries(cartCols.map((c, i) => [c, cartRow[i]]));
        const meta = cart.metadata ? JSON.parse(cart.metadata) : {};

        db.run(`
          INSERT INTO order_items (order_id, product_type, product_title, price, is_bonus, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [order.id, cart.product_type, cart.product_title, cart.price, cart.is_bonus || 0, cart.metadata || '{}']);

        const itemId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
        console.log(`  + Item inséré: ${cart.product_type} - ${cart.product_title} (item_id=${itemId})`);
      }
      console.log(`  ✓ Commande #${order.id} réparée avec ${cartItems[0].values.length} item(s)`);
    } else {
      console.log(`  ✗ Aucun item dans le panier de user_id=${order.user_id}`);
    }
    console.log('');
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('=== Réparation terminée ===');
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
