'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { db, initDb } = require('../services/database');

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(flag, fallback = '') {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
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
  const tenantId = getArgValue('--tenant', String(process.env.DEFAULT_TENANT_ID || 'public').trim() || 'public');
  const keepBootstrapAdmin = !hasFlag('--drop-bootstrap-admin');
  const confirm = hasFlag('--yes');
  const purgeFiles = !hasFlag('--keep-files');
  const bootstrapEmail = String(process.env.ADMIN_BOOTSTRAP_EMAIL || 'vievent7@hotmail.com').trim().toLowerCase();

  if (!confirm) {
    console.log('Annule: ajoutez --yes pour confirmer la remise a zero.');
    console.log('Exemple: node scripts/reset-test-environment.js --tenant public --yes');
    process.exit(1);
  }

  await initDb();

  const usersStmt = await db.prepare(
    'SELECT id, email, is_admin FROM users WHERE tenant_id = ? ORDER BY id ASC'
  );
  const users = usersStmt.all(tenantId);
  const preservedBootstrapUsers = [];
  const removableUsers = users.filter((u) => {
    if (!keepBootstrapAdmin) return true;
    const isBootstrapAdmin =
      Number(u.is_admin) === 1 && String(u.email || '').trim().toLowerCase() === bootstrapEmail;
    if (isBootstrapAdmin) preservedBootstrapUsers.push(u);
    return !isBootstrapAdmin;
  });
  const removableUserIds = removableUsers.map((u) => Number(u.id)).filter(Number.isFinite);

  const ordersStmt = await db.prepare('SELECT id FROM orders WHERE tenant_id = ? ORDER BY id ASC');
  const orders = ordersStmt.all(tenantId);
  const orderIds = orders.map((o) => Number(o.id)).filter(Number.isFinite);

  // 1) Purge commandes + dependances
  for (const orderId of orderIds) {
    const delTokens = await db.prepare('DELETE FROM download_tokens WHERE order_id = ?');
    delTokens.run(orderId);

    const delItems = await db.prepare('DELETE FROM order_items WHERE order_id = ?');
    delItems.run(orderId);
  }
  const delOrders = await db.prepare('DELETE FROM orders WHERE tenant_id = ?');
  delOrders.run(tenantId);
  // Nettoyage defensif: eliminer tout token orphelin restant.
  await db.run('DELETE FROM download_tokens WHERE order_id NOT IN (SELECT id FROM orders)');
  await db.run(`
    DELETE FROM download_tokens
    WHERE order_item_id IS NOT NULL
      AND order_item_id NOT IN (SELECT id FROM order_items)
  `);

  // 2) Purge paniers
  const delCartByTenant = await db.prepare('DELETE FROM cart WHERE tenant_id = ?');
  delCartByTenant.run(tenantId);
  for (const userId of removableUserIds) {
    const delCartByUser = await db.prepare('DELETE FROM cart WHERE user_id = ?');
    delCartByUser.run(userId);
  }

  // 3) Purge utilisateurs cibles
  for (const userId of removableUserIds) {
    const delUser = await db.prepare('DELETE FROM users WHERE id = ?');
    delUser.run(userId);
  }

  // 4) Purge fichiers generes
  if (purgeFiles) {
    const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    const generatedDirs = ['downloads', 'generated', 'previews', 'private'];
    for (const dirName of generatedDirs) {
      safeRmContents(path.join(storagePath, dirName));
    }
  }

  const remainingUsersStmt = await db.prepare(
    'SELECT id, email, is_admin, email_verified FROM users WHERE tenant_id = ? ORDER BY id ASC'
  );
  const remainingUsers = remainingUsersStmt.all(tenantId);
  const remainingAdmins = remainingUsers.filter((u) => Number(u.is_admin) === 1).length;
  const remainingVerifiedAdmins = remainingUsers.filter(
    (u) => Number(u.is_admin) === 1 && Number(u.email_verified) === 1
  ).length;

  console.log('Reset TEST termine');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Utilisateurs supprimes: ${removableUsers.length}`);
  console.log(`Utilisateurs bootstrap conserves: ${preservedBootstrapUsers.length}`);
  console.log(`Commandes supprimees: ${orderIds.length}`);
  console.log(`Fichiers generes purges: ${purgeFiles ? 'oui' : 'non'}`);
  console.log(`Admins restants: ${remainingAdmins}`);
  console.log(`Admins verifies restants: ${remainingVerifiedAdmins}`);
  if (preservedBootstrapUsers.length > 0) {
    console.log(
      `ATTENTION: compte bootstrap conserve (${bootstrapEmail}). Utilisez --drop-bootstrap-admin pour liberer cet email.`
    );
  }
  if (remainingVerifiedAdmins === 0) {
    console.log(`Prochaine inscription admin imposee: ${bootstrapEmail}`);
  }
}

main().catch((err) => {
  console.error('Echec reset TEST:', err.message);
  process.exit(1);
});
