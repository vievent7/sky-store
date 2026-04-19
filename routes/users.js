/**
 * Users — Inscription, connexion, gestion
 */

'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../services/database');
const { mergeSessionCartToDb } = require('./cart');
const { sendEmail, verifyEmailTemplate, resetPasswordTemplate } = require('../services/email-service');
const { DEFAULT_TENANT_ID, normalizeTenantId } = require('../services/tenant-context');

const SALT_ROUNDS = 10;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_BOOTSTRAP_EMAIL = String(process.env.ADMIN_BOOTSTRAP_EMAIL || 'vievent7@hotmail.com').trim().toLowerCase();
const REQUIRE_BOOTSTRAP_ADMIN_SIGNUP = String(process.env.REQUIRE_BOOTSTRAP_ADMIN_SIGNUP || '').trim().toLowerCase() === 'true';

function getTenantIdFromReq(req) {
  return normalizeTenantId(req?.tenantId || req?.session?.tenantId) || DEFAULT_TENANT_ID;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function getBaseUrl() {
  return process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

async function issueVerificationEmail({ userId, email, name }) {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
  const updStmt = await db.prepare(
    'UPDATE users SET email_verified = 0, email_verification_token = ?, email_verification_expires_at = ? WHERE id = ?'
  );
  await updStmt.run(verificationToken, verificationExpiresAt, userId);

  const verifyUrl = `${getBaseUrl()}/api/auth/verify-email?token=${verificationToken}&redirect=1`;
  sendEmail({
    to: email,
    ...verifyEmailTemplate({ customerName: name || '', verifyUrl })
  }).catch(e => console.error('[Email] verification erreur:', e.message));
}

// ============================================================
// REGISTER
// ============================================================

async function register(req, res) {
  const { email, password, name } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const tenantId = getTenantIdFromReq(req);

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caracteres' });
  }

  let bootstrapAdminSignup = false;
  if (REQUIRE_BOOTSTRAP_ADMIN_SIGNUP) {
    // Tant qu'aucun admin verifie n'existe, imposer l'email bootstrap pour le tout premier admin.
    const adminCountStmt = await db.prepare(
      'SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND is_admin = 1 AND email_verified = 1'
    );
    const adminCount = Number(adminCountStmt.get(tenantId)?.count || 0);
    bootstrapAdminSignup = adminCount === 0 && normalizedEmail === ADMIN_BOOTSTRAP_EMAIL;
    if (adminCount === 0 && !bootstrapAdminSignup) {
      return res.status(403).json({ error: 'Inscription reservee au compte admin bootstrap' });
    }
  }

  // Verifier si l'email existe deja
  const stmt = await db.prepare('SELECT id, name, email_verified FROM users WHERE email = ? AND tenant_id = ?');
  const existing = stmt.get(normalizedEmail, tenantId);
  if (existing) {
    if (!existing.email_verified) {
      await issueVerificationEmail({
        userId: existing.id,
        email: normalizedEmail,
        name: existing.name || name
      });
      return res.json({ success: true, emailVerificationSent: true, alreadyExistsUnverified: true });
    }
    return res.status(409).json({
      error: 'Cet email est deja utilise',
      code: 'EMAIL_ALREADY_USED',
      shouldLogin: true
    });
  }

  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const insert = await db.prepare(
    'INSERT INTO users (email, password_hash, name, is_admin, email_verified, email_verification_token, email_verification_expires_at, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const isAdmin = bootstrapAdminSignup ? 1 : 0;
  const emailVerified = bootstrapAdminSignup ? 1 : 0;
  await insert.run(normalizedEmail, hash, name, isAdmin, emailVerified, null, null, tenantId);

  // Recupere l'utilisateur par email
  const userStmt = await db.prepare('SELECT id, email, name, is_admin, email_verified FROM users WHERE email = ? AND tenant_id = ?');
  const user = userStmt.get(normalizedEmail, tenantId);

  if (bootstrapAdminSignup) {
    return res.json({
      success: true,
      bootstrapAdminCreated: true,
      emailVerificationSent: false
    });
  }

  await issueVerificationEmail({
    userId: user.id,
    email: normalizedEmail,
    name
  });

  res.json({ success: true, emailVerificationSent: true });
}

// ============================================================
// LOGIN
// ============================================================

async function login(req, res) {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const tenantId = getTenantIdFromReq(req);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  const stmt = await db.prepare('SELECT * FROM users WHERE email = ? AND tenant_id = ?');
  const user = stmt.get(normalizedEmail, tenantId);
  if (!user) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }

  if (!user.email_verified) {
    return res.status(403).json({ error: 'Email non confirme. Verifiez votre boite mail.', code: 'EMAIL_NOT_VERIFIED' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }

  // Rotation d'ID de session apres authentification (anti session fixation).
  const anonymousCartSnapshot = req.session?.cart
    ? JSON.parse(JSON.stringify(req.session.cart))
    : null;

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.tenantId = tenantId;
  if (anonymousCartSnapshot) {
    req.session.cart = anonymousCartSnapshot;
  }

  // Fusionner le panier de session dans le panier DB de l'utilisateur
  await mergeSessionCartToDb(req);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      is_admin: user.is_admin
    }
  });
}

// ============================================================
// LOGOUT
// ============================================================

async function logout(req, res) {
  try {
    await destroySession(req);
    res.clearCookie('sky.sid');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur deconnexion' });
  }
}

// ============================================================
// ME (qui suis-je ?)
// ============================================================

async function me(req, res) {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const tenantId = getTenantIdFromReq(req);
  const stmt = await db.prepare('SELECT id, email, name, is_admin, created_at, tenant_id FROM users WHERE id = ? AND tenant_id = ?');
  const user = stmt.get(req.session.userId, tenantId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ user: null });
  }
  res.json({ user: user || null, tenantId });
}

async function validateSession(req, res) {
  const tenantId = getTenantIdFromReq(req);
  if (!req.session?.userId) {
    return res.status(401).json({ valid: false, reason: 'not_authenticated', tenantId });
  }
  const stmt = await db.prepare('SELECT id, email, name, is_admin, created_at, tenant_id FROM users WHERE id = ? AND tenant_id = ?');
  const user = stmt.get(req.session.userId, tenantId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ valid: false, reason: 'session_invalid', tenantId });
  }
  return res.json({ valid: true, tenantId, user });
}

// ============================================================
// ADMIN: LIST USERS
// ============================================================

async function adminList(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const stmt1 = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const user = stmt1.get(req.session.userId);
  if (!user?.is_admin) return res.status(403).json({ error: 'Acces refuse' });

  const stmt2 = await db.prepare('SELECT id, email, name, is_admin, created_at FROM users ORDER BY created_at DESC');
  const users = stmt2.all();
  res.json({ users });
}

// ============================================================
// ADMIN: USER DETAIL + ORDERS
// ============================================================

async function adminGetUser(req, res) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const stmt1 = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const admin = stmt1.get(req.session.userId);
  if (!admin?.is_admin) return res.status(403).json({ error: 'Acces refuse' });

  const targetUserId = parseInt(req.params.id, 10);
  if (!targetUserId) return res.status(400).json({ error: 'ID utilisateur invalide' });

  const userStmt = await db.prepare('SELECT id, email, name, is_admin, created_at FROM users WHERE id = ?');
  const user = userStmt.get(targetUserId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const ordersStmt = await db.prepare(
    "SELECT id, user_id, total, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
  );
  const orders = ordersStmt.all(targetUserId);

  const ordersWithItems = await Promise.all(orders.map(async (order) => {
    const itemsStmt = await db.prepare(
      'SELECT id, product_type, product_title, price, is_bonus, metadata, created_at FROM order_items WHERE order_id = ? ORDER BY id ASC'
    );
    const items = itemsStmt.all(order.id).map((item) => {
      let metadata = {};
      try {
        metadata = JSON.parse(item.metadata || '{}');
      } catch (_) {}
      return { ...item, metadata };
    });
    return { ...order, items };
  }));

  const totalSpent = ordersWithItems.reduce((sum, order) => sum + (order.total || 0), 0);
  res.json({
    user,
    summary: {
      ordersCount: ordersWithItems.length,
      totalSpent
    },
    orders: ordersWithItems
  });
}

async function verifyEmail(req, res) {
  const token = String(req.query.token || '').trim();
  const wantsRedirect = String(req.query.redirect || '') === '1';
  const redirectBase = '/login';
  const redirect = (status) => res.redirect(`${redirectBase}?verified=${encodeURIComponent(status)}`);

  if (!token) return res.status(400).json({ error: 'Token manquant' });

  const findStmt = await db.prepare('SELECT id, email_verified, email_verification_expires_at FROM users WHERE email_verification_token = ?');
  const found = findStmt.get(token);
  if (!found) {
    if (wantsRedirect) return redirect('invalid');
    return res.status(400).json({ error: 'Token invalide ou expire' });
  }

  if (found.email_verified) {
    if (wantsRedirect) return redirect('ok');
    return res.json({ success: true, alreadyVerified: true });
  }

  if (!found.email_verification_expires_at || new Date(found.email_verification_expires_at) < new Date()) {
    if (wantsRedirect) return redirect('expired');
    return res.status(400).json({ error: 'Token invalide ou expire' });
  }

  const updStmt = await db.prepare('UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_expires_at = NULL WHERE id = ?');
  await updStmt.run(found.id);

  if (wantsRedirect) return redirect('ok');
  res.json({ success: true });
}

async function forgotPassword(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email requis' });

  const findStmt = await db.prepare('SELECT id, name, email FROM users WHERE email = ?');
  const user = findStmt.get(email);
  if (user) {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const updStmt = await db.prepare('UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?');
    await updStmt.run(token, expiresAt, user.id);

    const baseUrl = getBaseUrl();
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    sendEmail({
      to: user.email,
      ...resetPasswordTemplate({ customerName: user.name, resetUrl })
    }).catch(e => console.error('[Email] reset erreur:', e.message));
  }

  // Reponse volontairement neutre pour eviter l'enumeration d'emails.
  res.json({ success: true });
}

async function resendVerification(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email requis' });

  const findStmt = await db.prepare('SELECT id, name, email_verified FROM users WHERE email = ?');
  const user = findStmt.get(email);
  if (user && !user.email_verified) {
    await issueVerificationEmail({
      userId: user.id,
      email,
      name: user.name || ''
    });
  }

  // Reponse neutre pour limiter l'enumeration d'emails.
  res.json({ success: true });
}

async function resetPassword(req, res) {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  if (!token) return res.status(400).json({ error: 'Token manquant' });
  if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caracteres' });

  const findStmt = await db.prepare(
    'SELECT id, password_reset_expires FROM users WHERE password_reset_token = ?'
  );
  const user = findStmt.get(token);
  if (!user) return res.status(400).json({ error: 'Token invalide ou expire' });
  if (!user.password_reset_expires || new Date(user.password_reset_expires) < new Date()) {
    return res.status(400).json({ error: 'Token invalide ou expire' });
  }

  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const updStmt = await db.prepare(
    'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?'
  );
  await updStmt.run(hash, user.id);
  res.json({ success: true });
}

// ============================================================
// MIDDLEWARE: admin required
// ============================================================

async function adminRequired(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });
  const stmt = await db.prepare('SELECT is_admin FROM users WHERE id = ?');
  const user = stmt.get(req.session.userId);
  if (!user?.is_admin) return res.status(403).json({ error: 'Acces admin requis' });
  next();
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  register, login, logout, me,
  validateSession,
  verifyEmail, resendVerification, forgotPassword, resetPassword,
  adminList, adminGetUser, adminRequired
};
