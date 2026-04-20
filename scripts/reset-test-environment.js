'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { db, initDb } = require('../services/database');

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function safeRmContents(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

async function main() {
  if (!hasFlag('--yes')) {
    console.log('Annule: ajoutez --yes pour confirmer la remise a zero.');
    process.exit(1);
  }

  const purgeFiles = !hasFlag('--keep-files');
  const dropAdmins = hasFlag('--drop-admins');

  await initDb();

  // Purge commandes + dependances
  await db.run('DELETE FROM download_tokens');
  await db.run('DELETE FROM order_items');
  await db.run('DELETE FROM orders');

  // Purge orphelins defensif
  await db.run('DELETE FROM download_tokens WHERE order_id NOT IN (SELECT id FROM orders)');
  await db.run('DELETE FROM download_tokens WHERE order_item_id IS NOT NULL AND order_item_id NOT IN (SELECT id FROM order_items)');

  // Purge panier
  await db.run('DELETE FROM cart');

  // Purge utilisateurs (optionnellement conserver admins)
  if (dropAdmins) {
    await db.run('DELETE FROM users');
  } else {
    await db.run('DELETE FROM users WHERE COALESCE(is_admin, 0) = 0');
  }

  if (purgeFiles) {
    const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    for (const dirName of ['downloads', 'generated', 'previews', 'private']) {
      safeRmContents(path.join(storagePath, dirName));
    }
  }

  const usersStmt = await db.prepare('SELECT COUNT(*) as c FROM users');
  const ordersStmt = await db.prepare('SELECT COUNT(*) as c FROM orders');
  const itemsStmt = await db.prepare('SELECT COUNT(*) as c FROM order_items');
  const tokensStmt = await db.prepare('SELECT COUNT(*) as c FROM download_tokens');
  const orphanOrderStmt = await db.prepare('SELECT COUNT(*) as c FROM download_tokens WHERE order_id NOT IN (SELECT id FROM orders)');
  const orphanItemStmt = await db.prepare('SELECT COUNT(*) as c FROM download_tokens WHERE order_item_id IS NOT NULL AND order_item_id NOT IN (SELECT id FROM order_items)');

  console.log('Reset TEST termine');
  console.log(`Utilisateurs restants: ${usersStmt.get().c}`);
  console.log(`Commandes restantes: ${ordersStmt.get().c}`);
  console.log(`Items restants: ${itemsStmt.get().c}`);
  console.log(`Tokens restants: ${tokensStmt.get().c}`);
  console.log(`Orphelins order_id: ${orphanOrderStmt.get().c}`);
  console.log(`Orphelins order_item_id: ${orphanItemStmt.get().c}`);
  console.log(`Fichiers generes purges: ${purgeFiles ? 'oui' : 'non'}`);
}

main().catch((err) => {
  console.error('Echec reset TEST:', err.message);
  process.exit(1);
});
