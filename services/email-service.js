/**
 * EMAIL-SERVICE - Envoi de courriels transactionnels
 * =================================================
 * Mode TEST (defaut): log console
 * Mode REEL: SendGrid ou SMTP
 */

'use strict';

let _nodemailer = null;
function getNodemailer() {
  if (_nodemailer) return _nodemailer;
  try {
    // Optional dependency: only required for SMTP mode.
    // eslint-disable-next-line global-require
    _nodemailer = require('nodemailer');
    return _nodemailer;
  } catch (_) {
    return null;
  }
}

const isMock = !process.env.SENDGRID_API_KEY && !process.env.SMTP_HOST;

if (isMock) {
  console.log('[Email] Mode SIMULATION (aucun provider configure)');
}

/**
 * @typedef {Object} EmailOptions
 * @property {string} to
 * @property {string} subject
 * @property {string} html
 * @property {string} [text]
 */

/**
 * Envoie un email transactionnel.
 * @param {EmailOptions} options
 * @returns {Promise<{success: boolean, messageId: string}>}
 */
async function sendEmail({ to, subject, html, text }) {
  if (isMock) return mockSendEmail({ to, subject, html, text });
  if (process.env.SENDGRID_API_KEY) return sendViaSendGrid({ to, subject, html });
  if (process.env.SMTP_HOST) return sendViaSMTP({ to, subject, html, text });
  return mockSendEmail({ to, subject, html, text });
}

/** Email de confirmation de commande + recu */
function orderConfirmationEmail({ customerName, orderId, items, total, orderDate, downloadLinks = [] }) {
  const itemsHtml = (items || []).map(item =>
    `<li>${item.product_title || item.title || 'Produit'} - ${item.price === 0 ? 'GRATUIT' : '$' + (item.price / 100).toFixed(2)}</li>`
  ).join('');

  const dateLabel = orderDate
    ? new Date(orderDate).toLocaleString('fr-CA')
    : new Date().toLocaleString('fr-CA');

  const linksHtml = downloadLinks.length
    ? `<h3 style="margin-top:24px">Vos fichiers</h3>
       <ul style="padding-left:18px">${downloadLinks.map(l => `<li><a href="${l.url}" style="color:#4a90d9;text-decoration:none">${l.label}</a></li>`).join('')}</ul>
       <p style="font-size:12px;color:#888;margin-top:10px">Ces liens expirent dans 7 jours.</p>`
    : '';

  return {
    subject: `Commande #${orderId} confirmee - Sky Store`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">
  <div style="background:#0a0f1e;padding:30px;text-align:center">
    <h1 style="color:#aaccff;font-size:24px;margin:0">Sky Store</h1>
  </div>
  <div style="padding:30px 0">
    <p>Bonjour ${customerName || 'client'},</p>
    <p>Merci pour votre achat chez Sky Store.</p>
    <p>Votre commande <strong>#${orderId}</strong> a ete confirmee.</p>
    <p><strong>Recu:</strong> #${orderId}</p>
    <p><strong>Paiement recu:</strong> Oui</p>
    <p><strong>Date:</strong> ${dateLabel}</p>
    <h3 style="margin-top:20px">Recapitulatif</h3>
    <ul>${itemsHtml}</ul>
    <p style="font-size:18px;margin-top:20px"><strong>Total: $${(Number(total || 0) / 100).toFixed(2)} CAD</strong></p>
    ${linksHtml}
    <p style="margin-top:30px">Vous pouvez aussi retrouver vos fichiers dans votre espace personnel.</p>
    <a href="${process.env.BASE_URL || 'http://localhost:3000'}/account" style="background:#4a90d9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Acceder a mes achats</a>
  </div>
  <div style="background:#f5f0e8;padding:15px;text-align:center;font-size:12px;color:#666">
    Sky Store - Vos cartes du ciel personnalisees
  </div>
</body>
</html>`
  };
}

/** Email de disponibilite du produit achete */
function productDeliveredEmail({ customerName, productTitle, downloadUrl }) {
  return {
    subject: `Votre produit est pret - Sky Store`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">
  <div style="background:#0a0f1e;padding:30px;text-align:center">
    <h1 style="color:#aaccff;font-size:24px;margin:0">Sky Store</h1>
  </div>
  <div style="padding:30px 0">
    <p>Bonjour ${customerName},</p>
    <p>Votre <strong>${productTitle}</strong> est disponible au telechargement.</p>
    <a href="${downloadUrl}" style="background:#4a90d9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:20px 0">Telecharger maintenant</a>
    <p style="font-size:12px;color:#888;margin-top:15px">Ce lien expire dans 7 jours.</p>
  </div>
</body>
</html>`
  };
}

function verifyEmailTemplate({ customerName, verifyUrl }) {
  return {
    subject: 'Confirmez votre email - Sky Store',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">
  <div style="background:#0a0f1e;padding:30px;text-align:center">
    <h1 style="color:#aaccff;font-size:24px;margin:0">Sky Store</h1>
  </div>
  <div style="padding:30px 0">
    <p>Bonjour ${customerName || ''},</p>
    <p>Merci pour votre inscription. Confirmez votre email en cliquant ci-dessous:</p>
    <a href="${verifyUrl}" style="background:#4a90d9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:20px 0">Confirmer mon email</a>
    <p style="font-size:12px;color:#666">Si vous n'avez pas cree de compte, ignorez ce message.</p>
  </div>
</body>
</html>`
  };
}

function resetPasswordTemplate({ customerName, resetUrl }) {
  return {
    subject: 'Reinitialisation du mot de passe - Sky Store',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">
  <div style="background:#0a0f1e;padding:30px;text-align:center">
    <h1 style="color:#aaccff;font-size:24px;margin:0">Sky Store</h1>
  </div>
  <div style="padding:30px 0">
    <p>Bonjour ${customerName || ''},</p>
    <p>Vous avez demande une reinitialisation de mot de passe.</p>
    <a href="${resetUrl}" style="background:#4a90d9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:20px 0">Reinitialiser mon mot de passe</a>
    <p style="font-size:12px;color:#666">Ce lien expire dans 1 heure.</p>
  </div>
</body>
</html>`
  };
}

async function mockSendEmail({ to, subject, html, text }) {
  console.log('\n========== [EMAIL MOCK] ==========');
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body:\n${text || String(html).substring(0, 200)}...`);
  console.log('===================================\n');
  return { success: true, messageId: 'mock_' + Date.now() };
}

async function sendViaSendGrid({ to, subject, html }) {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@skystore.com';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Sky Store';
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SendGrid error: ${response.status} ${errorBody}`);
  }
  return { success: true, messageId: 'sg_' + Date.now() };
}

async function sendViaSMTP({ to, subject, html, text }) {
  const nodemailer = getNodemailer();
  if (!nodemailer) {
    throw new Error('SMTP configure mais nodemailer non installe');
  }

  const secureFromEnv = String(process.env.SMTP_SECURE || '').toLowerCase();
  const secure = secureFromEnv === 'true' || process.env.SMTP_PORT === '465';
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || (secure ? 465 : 587)),
    secure,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || ''
        }
      : undefined
  });

  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'noreply@skystore.com';
  const fromName = process.env.SMTP_FROM_NAME || 'Sky Store';

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text
  });

  return { success: true, messageId: info.messageId || ('smtp_' + Date.now()) };
}

module.exports = {
  sendEmail,
  orderConfirmationEmail,
  productDeliveredEmail,
  verifyEmailTemplate,
  resetPasswordTemplate,
  isMock: () => isMock
};
