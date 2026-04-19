#!/usr/bin/env node
'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { initDb, db } = require('../services/database');
const { DEFAULT_TENANT_ID, normalizeTenantId } = require('../services/tenant-context');

const SALT_ROUNDS = 10;

function fail(message) {
  console.error(`[admin-reset] ${message}`);
  process.exit(1);
}

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return '';
  return String(process.argv[idx + 1] || '').trim();
}

async function main() {
  const email = String(readArg('--email') || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const newPassword = String(readArg('--password') || process.env.ADMIN_NEW_PASSWORD || '');
  const tenantId = normalizeTenantId(readArg('--tenant') || process.env.ADMIN_TENANT_ID) || DEFAULT_TENANT_ID;

  if (!email) fail('ADMIN_EMAIL manquant');
  if (!newPassword) fail('ADMIN_NEW_PASSWORD manquant');
  if (newPassword.length < 12) fail('ADMIN_NEW_PASSWORD doit contenir au moins 12 caracteres');

  await initDb();

  const findStmt = await db.prepare(
    'SELECT id, email, is_admin, tenant_id FROM users WHERE email = ? AND tenant_id = ?'
  );
  const user = findStmt.get(email, tenantId);
  if (!user) fail(`Aucun utilisateur trouve pour ${email} (tenant=${tenantId})`);
  if (!user.is_admin) fail(`L utilisateur ${email} n est pas admin`);

  const passwordHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  const updateStmt = await db.prepare(
    'UPDATE users SET password_hash = ?, email_verified = 1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?'
  );
  await updateStmt.run(passwordHash, user.id);

  console.log(`[admin-reset] OK email=${email} tenant=${tenantId}`);
}

main().catch((error) => {
  console.error('[admin-reset] Erreur:', error?.message || error);
  process.exit(1);
});
