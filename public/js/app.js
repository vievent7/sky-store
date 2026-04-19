// Sky Store - Frontend JS

const SKY_MAP_PRICE = 2000; // 20$ CAD - modifier ici pour changer le prix partout
var previewLoading = false;
function tr(key, fallback, vars) {
  return fallback || key;
}

// INIT
document.addEventListener('DOMContentLoaded', async () => {
  await loadMe();
  updateNav();
  updateCartCount();
  initAmbiancesSelectionGuards();
  const p = window.location.pathname;
  if (p === '/cart' || p === '/cart.html') renderCartPage();
  if (p === '/gallery' || p === '/gallery.html') renderGalleryPage();
  if (p === '/create-map' || p === '/create-map.html') initCreatorPage();
  if (p === '/account' || p === '/account.html') renderAccountPage();
  if (p === '/admin' || p === '/admin.html') renderAdminPage();
  if (p === '/forgot-password' || p === '/forgot-password.html') initForgotPasswordPage();
  if (p === '/reset-password' || p === '/reset-password.html') initResetPasswordPage();
  if (p === '/verify-email' || p === '/verify-email.html') handleVerifyEmailPage();
  if (p === '/success' || p === '/success.html') handleSuccessPage();
  if (p === '/checkout' || p === '/checkout.html') handleCheckout();
  if (p === '/login' || p === '/login.html') handleLoginStatusFromQuery();
});

// AUTH
async function loadMe() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const data = await res.json();
    currentUser = data.user;
  } catch(e) { currentUser = null; }
}

async function doRegister(e) {
  if (e && e.preventDefault) e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const msgEl = document.getElementById('reg-msg');
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 409 && data.code === 'EMAIL_ALREADY_USED') {
      if (typeof showTab === 'function') showTab('login');
      var loginEmailEl = document.getElementById('login-email');
      var loginMsgEl = document.getElementById('login-msg');
      if (loginEmailEl) loginEmailEl.value = email;
      if (loginMsgEl) {
        loginMsgEl.innerHTML = '<div class="alert" style="background:rgba(61,186,120,.15);border:1px solid var(--success);color:var(--success)">Ce compte existe deja. Connectez-vous avec cet email.</div>';
      }
      msgEl.innerHTML = '';
      return;
    }
    msgEl.innerHTML = '<div class="alert alert-error">' + (data.error || tr('ui.error', 'Erreur')) + '</div>';
    return;
  }
  if (data.emailVerificationSent) {
    msgEl.innerHTML = '<div class="alert" style="background:rgba(61,186,120,.15);border:1px solid var(--success);color:var(--success)">' + tr('ui.saved_account', 'Compte cree. Verifiez votre email pour activer votre connexion.') + '</div>';
    setTimeout(function() { window.location.href = '/login'; }, 1400);
    return;
  }
  // Compte admin force: connexion directe
  msgEl.innerHTML = '<div class="alert" style="background:rgba(61,186,120,.15);border:1px solid var(--success);color:var(--success)">' + tr('ui.saved_login', 'Compte cree ! Connexion en cours...') + '</div>';
  currentUser = data.user || null;
  updateNav();
  const nextUrl = new URLSearchParams(window.location.search).get('next') || '/account';
  setTimeout(function() { window.location.href = nextUrl; }, 800);
}

async function doLogin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const msgEl = document.getElementById('login-msg');
  const successEl = document.getElementById('login-success');
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.code === 'EMAIL_NOT_VERIFIED') {
      var safeEmail = String(email || '').replace(/\"/g, '&quot;');
      msgEl.innerHTML = '<div class="alert alert-error">' + (data.error || tr('ui.email_not_verified', 'Email non confirme')) +
        '<div style="margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="resendVerificationEmail(\'' + safeEmail + '\')">' + tr('ui.resend_verification', 'Renvoyer le mail de verification') + '</button></div></div>';
    } else {
      msgEl.innerHTML = '<div class="alert alert-error">' + (data.error || tr('ui.error', 'Erreur')) + '</div>';
    }
    if (successEl) successEl.style.display = 'none';
    return;
  }
  // Succes : affiche le message avant de rediriger
  if (successEl) {
    successEl.textContent = tr('ui.login_success_redirect', 'Connexion reussie ! Redirection...');
    successEl.style.display = 'block';
  }
  const nextUrl = new URLSearchParams(window.location.search).get('next') || '/account';
  msgEl.innerHTML = '';
  currentUser = data.user;
  updateNav();
  setTimeout(function() { window.location.href = nextUrl; }, 800);
}

async function doLogout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  currentUser = null;
  window.location.href = '/';
}

async function doForgotPassword() {
  var emailEl = document.getElementById('forgot-email');
  var msgEl = document.getElementById('forgot-msg');
  if (!emailEl || !msgEl) return;
  var email = emailEl.value.trim();
  if (!email) {
    msgEl.innerHTML = '<div class="alert alert-error">' + tr('ui.email_required', 'Email requis') + '</div>';
    return;
  }
  var res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email: email })
  });
  var data = await res.json();
  if (!res.ok) {
    msgEl.innerHTML = '<div class="alert alert-error">' + (data.error || tr('ui.error', 'Erreur')) + '</div>';
    return;
  }
  msgEl.innerHTML = '<div class="alert" style="background:rgba(61,186,120,.15);border:1px solid var(--success);color:var(--success)">' + tr('ui.reset_sent', 'Si cet email existe, un lien de reinitialisation a ete envoye.') + '</div>';
}

async function doResetPassword() {
  var pwdEl = document.getElementById('reset-password');
  var msgEl = document.getElementById('reset-msg');
  if (!pwdEl || !msgEl) return;
  var token = new URLSearchParams(window.location.search).get('token') || '';
  var password = pwdEl.value || '';
  if (!token) {
    msgEl.innerHTML = '<div class="alert alert-error">' + tr('ui.invalid_link_token', 'Lien invalide (token manquant)') + '</div>';
    return;
  }
  var res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token: token, password: password })
  });
  var data = await res.json();
  if (!res.ok) {
    msgEl.innerHTML = '<div class="alert alert-error">' + (data.error || tr('ui.error', 'Erreur')) + '</div>';
    return;
  }
  msgEl.innerHTML = '<div class="alert" style="background:rgba(61,186,120,.15);border:1px solid var(--success);color:var(--success)">' + tr('ui.password_reset_done', 'Mot de passe reinitialise. Redirection vers connexion...') + '</div>';
  setTimeout(function() { window.location.href = '/login'; }, 1200);
}

async function handleVerifyEmailPage() {
  var msgEl = document.getElementById('verify-msg');
  if (!msgEl) return;
  var token = new URLSearchParams(window.location.search).get('token') || '';
  if (!token) {
    msgEl.innerHTML = '<span style="color:var(--danger)">' + tr('ui.invalid_link_token', 'Lien invalide (token manquant)') + '.</span>';
    return;
  }
  var res = await fetch('/api/auth/verify-email?token=' + encodeURIComponent(token), {
    credentials: 'same-origin'
  });
  var data = await res.json();
  if (!res.ok) {
    msgEl.innerHTML = '<span style="color:var(--danger)">' + (data.error || tr('ui.verify_failed', 'Echec de verification')) + '</span>';
    return;
  }
  msgEl.innerHTML = '<span style="color:var(--success)">' + tr('ui.email_verified_login', 'Email confirme. Vous pouvez maintenant vous connecter.') + '</span>';
  setTimeout(function() { window.location.href = '/login?verified=ok'; }, 1000);
}

function handleLoginStatusFromQuery() {
  if (typeof showTab === 'function') showTab('login');
  var params = new URLSearchParams(window.location.search);
  var verified = params.get('verified');
  var msgEl = document.getElementById('login-msg');
  var successEl = document.getElementById('login-success');
  if (!verified || (!msgEl && !successEl)) return;

  if (verified === 'ok') {
    if (successEl) {
      successEl.textContent = tr('ui.email_verified', 'Email verifie. Vous pouvez vous connecter.');
      successEl.style.display = 'block';
    } else if (msgEl) {
      msgEl.innerHTML = '<div class="alert" style="background:rgba(61,186,120,.15);border:1px solid var(--success);color:var(--success)">' + tr('ui.email_verified', 'Email verifie. Vous pouvez vous connecter.') + '</div>';
    }
    return;
  }

  if (msgEl) {
    msgEl.innerHTML = '<div class="alert alert-error">' + tr('ui.invalid_or_expired', 'Lien de verification invalide ou expire.') + '</div>';
  }
}

async function resendVerificationEmail(email) {
  var msgEl = document.getElementById('login-msg');
  var targetEmail = String(email || '').trim();
  if (!targetEmail) return;
  var res = await fetch('/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email: targetEmail })
  });
  var data = await res.json();
  if (!res.ok) {
    if (msgEl) msgEl.innerHTML = '<div class="alert alert-error">' + (data.error || tr('ui.error', 'Erreur')) + '</div>';
    return;
  }
  if (msgEl) {
    msgEl.innerHTML = '<div class="alert" style="background:rgba(61,186,120,.15);border:1px solid var(--success);color:var(--success)">' + tr('ui.resend_sent', 'Si le compte existe et nest pas verifie, un nouvel email de verification a ete envoye.') + '</div>';
  }
}

function initForgotPasswordPage() {}
function initResetPasswordPage() {}

// NAV
function updateNav() {
  const accountEl = document.getElementById('nav-account');
  const navLinks = accountEl ? accountEl.parentNode : null;
  if (!accountEl) return;
  var adminLink = document.getElementById('nav-admin');
  if (adminLink) adminLink.remove();
  if (currentUser) {
    accountEl.textContent = currentUser.name;
    if (currentUser.is_admin && navLinks) {
      adminLink = document.createElement('a');
      adminLink.id = 'nav-admin';
      adminLink.href = '/admin';
      adminLink.textContent = tr('nav.admin', 'Admin');
      navLinks.insertBefore(adminLink, accountEl);
    }
    // Ajoute un bouton deconnexion apres le lien si pas deja present
    if (!document.getElementById('nav-logout')) {
      const btn = document.createElement('button');
      btn.id = 'nav-logout';
      btn.textContent = tr('nav.logout', 'Deconnexion');
      btn.className = 'btn btn-ghost btn-sm';
      btn.style.cssText = 'margin-left:8px;padding:4px 12px;font-size:.85rem';
      btn.onclick = doLogout;
      accountEl.parentNode.insertBefore(btn, accountEl.nextSibling);
    }
  } else {
    accountEl.textContent = tr('nav.login', 'Connexion');
    accountEl.href = '/login';
    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn) logoutBtn.remove();
  }
}

async function updateCartCount() {
  const el = document.getElementById('cart-count');
  if (!el) return;
  try {
    const res = await fetch('/api/cart');
    const data = await res.json();
    const count = data.items ? data.items.length : 0;
    el.textContent = count > 0 ? count : '';
    el.style.display = count > 0 ? 'inline-flex' : 'none';
  } catch(e) {}
}

// CART
async function loadCart() {
  try {
    const res = await fetch('/api/cart');
    return res.ok ? res.json() : { items: [], total: 0 };
  } catch(e) { return { items: [], total: 0 }; }
}

var ambianceSelectionResetTimer = null;
function resetAmbianceSelectionState() {
  try {
    if (typeof window.clearAmbianceSelection === 'function') {
      window.clearAmbianceSelection();
      return;
    }
  } catch (e) {}

  ['selectedAmbiances', 'selectedAmbianceIds', 'ambianceSelection'].forEach(function(key) {
    var value = window[key];
    if (Array.isArray(value)) {
      value.length = 0;
      return;
    }
    if (value && typeof value.clear === 'function') {
      value.clear();
      return;
    }
    if (value && typeof value === 'object') {
      window[key] = {};
    }
  });

  // Clear any other global ambiance selection containers from external scripts.
  Object.keys(window).forEach(function(key) {
    if (!/ambiance|selection/i.test(key)) return;
    if (['sessionStorage', 'localStorage'].indexOf(key) >= 0) return;
    var value = window[key];
    if (Array.isArray(value)) {
      value.length = 0;
      return;
    }
    if (value && typeof value.clear === 'function') {
      value.clear();
      return;
    }
  });

  // Reset persisted selection state if the Ambiances page stores it in Web Storage.
  try {
    if (window.sessionStorage) {
      Object.keys(window.sessionStorage).forEach(function(k) {
        if (/ambiance|selection/i.test(k)) window.sessionStorage.removeItem(k);
      });
    }
  } catch (e) {}
  try {
    if (window.localStorage) {
      Object.keys(window.localStorage).forEach(function(k) {
        if (/ambiance|selection/i.test(k)) window.localStorage.removeItem(k);
      });
    }
  } catch (e) {}

  document.querySelectorAll(
    '.ambiance-item.selected, .ambiance-card.selected, .ambiance-option.selected, [data-ambiance-id].selected'
  ).forEach(function(el) {
    el.classList.remove('selected');
  });

  document.querySelectorAll(
    'input[type=\"checkbox\"][data-ambiance-id], input[type=\"checkbox\"][name*=\"ambiance\"], input[type=\"radio\"][name*=\"ambiance\"]'
  ).forEach(function(input) {
    input.checked = false;
  });

  ['selected-ambiance-count', 'ambiance-selected-count', 'ambianceSelectionCount'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = '0';
  });
}

function scheduleAmbianceSelectionReset() {
  if (ambianceSelectionResetTimer) clearTimeout(ambianceSelectionResetTimer);
  ambianceSelectionResetTimer = setTimeout(function() {
    resetAmbianceSelectionState();
  }, 250);
}

function isAddAmbianceSelectionButton(el) {
  if (!el) return false;
  var node = el.closest ? el.closest('button, a') : null;
  if (!node) return false;
  var txt = String(node.textContent || '').toLowerCase();
  return txt.indexOf('ajouter la selection au panier') >= 0
    || txt.indexOf('ajouter la sélection au panier') >= 0;
}

function initAmbiancesSelectionGuards() {
  if (window.location.pathname.indexOf('/ambiances') !== 0) return;

  // Guard against repeated clicks that accumulate before UI reset.
  document.addEventListener('click', function(e) {
    if (!isAddAmbianceSelectionButton(e.target)) return;
    var btn = e.target.closest('button, a');
    if (btn && btn.tagName === 'BUTTON') {
      btn.disabled = true;
      setTimeout(function() { btn.disabled = false; }, 900);
    }
    setTimeout(function() {
      resetAmbianceSelectionState();
    }, 300);
  }, true);

  // Explicit fallback action requested by board: clear current selection.
  setTimeout(function() {
    var addBtn = Array.from(document.querySelectorAll('button, a')).find(function(el) {
      return isAddAmbianceSelectionButton(el);
    });
    if (!addBtn) return;
    if (document.getElementById('btn-clear-ambiance-selection')) return;

    var clearBtn = document.createElement('button');
    clearBtn.id = 'btn-clear-ambiance-selection';
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-ghost';
    clearBtn.textContent = 'Effacer la selection';
    clearBtn.style.marginTop = '8px';
    clearBtn.onclick = function() {
      resetAmbianceSelectionState();
      showToast('Selection effacee');
    };

    addBtn.insertAdjacentElement('afterend', clearBtn);
  }, 120);
}

async function addToCart(item) {
  const res = await fetch('/api/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item)
  });
  const data = await res.json();
  if (res.ok) {
    cart = data.cart;
    updateCartCount();
    if (item && item.type === 'ambiance') {
      scheduleAmbianceSelectionReset();
      if (window.location.pathname.indexOf('/ambiances') === 0) {
        window.location.href = '/cart';
        return;
      }
    }
    showToast(tr('cart.toast.added', 'Ajoute au panier'));
  } else {
    showToast(data.error || tr('ui.error', 'Erreur'), 'error');
  }
}

async function clearCart() {
  if (!confirm(tr('cart.confirm.clear', 'Vider entierement le panier?'))) return;
  await fetch('/api/cart', { method: 'DELETE', credentials: 'same-origin' });
  cart = { items: [], total: 0 };
  renderCartPage();
  updateCartCount();
  showToast(tr('cart.toast.empty', 'Panier vide'), 'success');
}

async function removeCartItem(id) {
  await fetch('/api/cart/items/' + id, { method: 'DELETE' });
  renderCartPage();
  updateCartCount();
}

// CART PAGE
async function renderCartPage() {
  const data = await loadCart();
  cart = data;
  const container = document.getElementById('cart-items');
  const summaryEl = document.getElementById('cart-summary');
  if (!container) return;

  if (!data.items || !data.items.length) {
    container.innerHTML = '<div class="cart-empty"><h3>' + tr('cart.empty.title', 'Panier vide') + '</h3><p>' + tr('cart.empty.subtitle', 'Parcourez nos cartes et photos.') + '</p><a href="/gallery" class="btn btn-ghost" style="margin-top:16px">' + tr('cart.empty.cta', 'Voir la galerie') + '</a></div>';
    if (summaryEl) summaryEl.style.display = 'none';
    return;
  }

  container.innerHTML = data.items.map(function(item) {
    var thumbHtml = '';
    if (item.type === 'sky_map') {
      thumbHtml = '<svg width="40" height="40" fill="none" stroke="#4a90d9" stroke-width="1.5"><circle cx="20" cy="20" r="18"/><circle cx="20" cy="20" r="4" fill="#4a90d9"/><circle cx="12" cy="14" r="1.5" fill="#aaccff"/><circle cx="28" cy="12" r="1" fill="#aaccff"/></svg>';
    } else if (item.type === 'ambiance' || item.type === 'bonus_ambiance') {
      var ambianceImg = (item.metadata && (item.metadata.backgroundImageUrl || item.metadata.imageUrl || item.metadata.thumbUrl)) || '';
      if (ambianceImg) {
        thumbHtml = '<img src="' + ambianceImg + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block">';
      } else {
        thumbHtml = '<span style="font-size:1.3rem;color:#8fb2d9">♪</span>';
      }
    } else {
      thumbHtml = '<div style="position:relative;width:100%;height:100%;">' +
        '<img src="/api/photos/' + (item.metadata && item.metadata.photoId || '') + '/thumb" alt="" style="width:100%;height:100%;object-fit:cover;display:block">' +
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(140deg,rgba(10,15,30,0.08),rgba(10,15,30,0.18));pointer-events:none;">' +
        '<span style="font-family:\'Montserrat\',Arial,sans-serif;font-size:9px;font-weight:600;letter-spacing:.17em;color:rgba(255,255,255,.3);text-transform:uppercase;transform:rotate(-24deg);text-shadow:0 1px 4px rgba(0,0,0,.45);white-space:nowrap;">SKY STORE</span>' +
        '</div></div>';
    }
    var extraInfo = '';
    if (item.type === 'sky_map' && item.metadata) {
      extraInfo = item.metadata.location_name + ' &bull; ' + item.metadata.date;
    } else if (item.type === 'ambiance' || item.type === 'bonus_ambiance') {
      extraInfo = tr('cart.ambiance', 'Ambiance');
    }
    // Nouvelle logique gratuite automatique: displayPrice=0 ou isFree=true = gratuit avec carte
    var isFree = item.isFree || item.displayPrice === 0;
    var priceText = isFree ? tr('cart.free_with_card', 'Gratuit avec carte') : '$' + ((item.displayPrice || item.price) / 100).toFixed(2);
    var freeBadge = isFree ? ' <span style="background:rgba(61,186,120,.15);color:#3dba78;padding:2px 8px;border-radius:10px;font-size:.7rem;margin-left:6px">' + tr('cart.free', 'GRATUIT') + '</span>' : '';
    var canRemove = !item.autoGeneratedBonus && item.type !== 'bonus_ambiance';
    var actionHtml = canRemove
      ? '<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();removeCartItem(\'' + item.id + '\')">' + tr('cart.remove', 'Supprimer') + '</button>'
      : '<span style="font-size:.75rem;color:var(--text-muted)">' + tr('cart.auto_bonus', 'Bonus automatique') + '</span>';
    return '<div class="cart-item' + (isFree ? ' cart-item-bonus' : '') + '">' +
      '<div class="cart-item-thumb">' + thumbHtml + '</div>' +
      '<div class="cart-item-info"><h4>' + item.title + '</h4><p>' + extraInfo + '</p>' + freeBadge + '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">' +
      '<span class="cart-item-price" style="color:' + (isFree ? '#3dba78' : 'inherit') + '">' + priceText + '</span>' +
      actionHtml + '</div></div>';
  }).join('');

  if (summaryEl) {
    summaryEl.style.display = 'block';
    var subtotal = data.total;
    var taxes = Math.round(subtotal * 0.14975);
    var total = subtotal + taxes;
    var freeInfo = '';
    if (data.freePhotoCount > 0) {
      freeInfo = '<div class="summary-row" style="color:#3dba78"><span>' + tr('cart.free_photos', '{count} photo(s) gratuite(s) avec carte', { count: data.freePhotoCount }) + '</span><span></span></div>';
    }
    summaryEl.innerHTML = '<h3>' + tr('cart.summary', 'Resume') + '</h3>' +
      '<div class="summary-row"><span>' + tr('cart.subtotal', 'Sous-total') + '</span><span>$' + (subtotal / 100).toFixed(2) + ' CAD</span></div>' +
      freeInfo +
      '<div class="summary-row"><span>' + tr('cart.tax', 'TPS + TVQ (~15%)') + '</span><span>$' + (taxes / 100).toFixed(2) + ' CAD</span></div>' +
      '<div class="summary-row total"><span>' + tr('cart.total', 'Total') + '</span><span>$' + (total / 100).toFixed(2) + ' CAD</span></div>' +
      '<button class="btn btn-primary btn-lg" style="width:100%;margin-top:20px" onclick="goToCheckout()">' + tr('cart.checkout', 'Passer a la caisse') + '</button>' +
      '<p style="text-align:center;font-size:.8rem;color:var(--text-muted);margin-top:12px">' + tr('cart.secure_stripe', 'Paiement securise par Stripe') + '</p>';
  }
}

async function goToCheckout() {
  var res = await fetch('/api/cart/validate', { method: 'POST' });
  var data = await res.json();
  if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
    window.location.href = '/login?next=/cart';
    return;
  }
  if (!data.valid) { showToast(data.error || tr('cart.invalid', 'Panier invalide'), 'error'); return; }
  var checkoutRes = await fetch('/api/checkout', { method: 'POST' });
  var checkout = await checkoutRes.json();
  if (checkoutRes.ok && checkout && checkout.url) {
    window.location.href = checkout.url;
    return;
  }
  if (!checkoutRes.ok) {
    showToast((checkout && checkout.error) || tr('ui.error', 'Erreur'), 'error');
    return;
  }
  window.location.href = '/checkout';
}

// CHECKOUT
async function handleCheckout() {
  var data = await loadCart();
  if (!data.items || !data.items.length) { window.location.href = '/cart'; return; }
  var taxes = Math.round(data.total * 0.14975);
  var total = data.total + taxes;
  var el = document.getElementById('checkout-total');
  if (el) el.textContent = '$' + (total / 100).toFixed(2);
  var res = await fetch('/api/checkout', { method: 'POST' });
  var result = await res.json();
  if (!res.ok) { showToast(result.error || tr('ui.error', 'Erreur'), 'error'); return; }
  if (result.url) window.location.href = result.url;
}

// SUCCESS
async function handleSuccessPage() {
  var params = new URLSearchParams(window.location.search);
  var orderId = params.get('order_id');
  var isMock = params.get('mock') === 'true';
  var el = document.getElementById('success-msg');
  if (!el) return;
  if (isMock || orderId) {
    setTimeout(function() {
      el.innerHTML = '<div style="text-align:center;padding:40px 0">' +
        '<svg width="80" height="80" fill="none"><circle cx="40" cy="40" r="38" stroke="#3dba78" stroke-width="2"/><path d="M25 40 L36 51 L56 29" stroke="#3dba78" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<h2 style="margin-top:24px">Paiement confirme !</h2>' +
        (orderId ? '<p>Commande #' + orderId + '</p>' : '') +
        '<p style="margin-top:12px">Vos fichiers sont en cours de generation...</p>' +
        '<a href="/account" class="btn btn-primary" style="margin-top:28px">Voir mes achats</a></div>';
    }, 1500);
  }
}

// SKY MAP CREATOR
var previewAbort = null;
var selectedBackgroundId = null;
var backgroundPhotos = [];
var previewSvgUrl = null;

function getSkySphereOptions() {
  var densityEl = document.getElementById('creator-density');
  var labelsEl = document.getElementById('creator-show-const-labels');
  return {
    starDensity: densityEl ? densityEl.value : 'normal',
    showConstellationLabels: labelsEl ? !!labelsEl.checked : true
  };
}

async function initCreatorPage() {
  // Charger les photos pour le picker de fond
  try {
    const res = await fetch('/api/photos');
    backgroundPhotos = await res.json();
    renderBackgroundPicker(backgroundPhotos);
  } catch(e) { console.warn('Impossible de charger les photos de fond'); }

  document.querySelectorAll('.style-option').forEach(function(opt) {
    opt.addEventListener('click', function() {
      document.querySelectorAll('.style-option').forEach(function(o) { o.classList.remove('selected'); });
      opt.classList.add('selected');
      opt.querySelector('input').checked = true;
      updatePreview();
    });
  });

  var locationInput = document.getElementById('creator-location');
  if (locationInput) {
    locationInput.addEventListener('blur', async function() {
      var val = locationInput.value.trim();
      if (!val) return;
      try {
        var res = await fetch('/api/geo?location=' + encodeURIComponent(val));
        var data = await res.json();
        document.getElementById('creator-lat').value = data.lat || '';
        document.getElementById('creator-lng').value = data.lng || '';
        if (data.displayName) {
          var note = document.getElementById('creator-location-note');
          if (!note) {
            locationInput.insertAdjacentHTML('afterend', '<small id="creator-location-note" style="color:var(--success);font-size:.8rem">&#10003; ' + data.displayName + '</small>');
          }
        }
        updatePreview();
      } catch(e) { showToast(tr('creator.place_not_found', 'Lieu non trouve'), 'error'); }
    });
  }

  ['creator-date', 'creator-time', 'creator-title', 'creator-subtitle', 'creator-density', 'creator-show-const-labels'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', debounce(updatePreview, 800));
      el.addEventListener('change', debounce(updatePreview, 400));
    }
  });

  var form = document.getElementById('creator-form');
  if (form) form.addEventListener('submit', handleCreatorSubmit);
}

function renderBackgroundPicker(photos) {
  var container = document.getElementById('bg-picker');
  if (!container) return;
  // Le premier item "aucun" est deja dans le HTML, on garde sa selection par defaut
  var html = container.querySelector('.bg-picker-none')
    ? container.querySelector('.bg-picker-none').outerHTML
    : '';
  photos.forEach(function(p) {
    var selected = selectedBackgroundId === p.id ? ' selected' : '';
    html += '<div class="bg-picker-item' + selected + '" onclick="selectBackground(\'' + p.id + '\', this)" title="' + p.title + '">' +
      '<img src="' + p.thumbUrl + '" alt="' + p.title + '" loading="lazy">' +
      '<div class="bg-picker-check"><svg viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg></div>' +
      '</div>';
  });
  // Remplacer tout le contenu (garder le .bg-picker-none s'il existe)
  var noneItem = container.querySelector('.bg-picker-none');
  container.innerHTML = html;
  // RÃ©injecter le .bg-picker-none en premier si on l'avait
  // (on le reconstruit car innerHTML l'a gardÃ©)
}

function selectBackground(photoId, el) {
  // GÃ©rer la classe selected sur le .bg-picker-none
  document.querySelectorAll('.bg-picker-item, .bg-picker-none').forEach(function(e) {
    e.classList.remove('selected');
  });
  if (!photoId) {
    // Aucun fond
    var noneEl = document.querySelector('.bg-picker-none');
    if (noneEl) noneEl.classList.add('selected');
    document.getElementById('bg-selected-label').textContent = '';
    selectedBackgroundId = null;
  } else {
    el.classList.add('selected');
    var photo = backgroundPhotos.find(function(p) { return p.id === photoId; });
    if (photo) document.getElementById('bg-selected-label').textContent = '- ' + photo.title;
    selectedBackgroundId = photoId;
  }
  updatePreview();
}

async function updatePreview() {
  var date = document.getElementById('creator-date') ? document.getElementById('creator-date').value : '';
  var time = document.getElementById('creator-time') ? document.getElementById('creator-time').value : '';
  var lat = parseFloat(document.getElementById('creator-lat') ? document.getElementById('creator-lat').value : '0');
  var lng = parseFloat(document.getElementById('creator-lng') ? document.getElementById('creator-lng').value : '0');
  var location_name = document.getElementById('creator-location') ? document.getElementById('creator-location').value : '';
  var title = document.getElementById('creator-title') ? document.getElementById('creator-title').value : '';
  var subtitle = document.getElementById('creator-subtitle') ? document.getElementById('creator-subtitle').value : '';
  var styleEl = document.querySelector('.style-option input:checked');
  var style = styleEl ? styleEl.value : 'dark';
  var sphere = getSkySphereOptions();
  var previewImg = document.getElementById('preview-img');
  var previewPlaceholder = document.getElementById('preview-placeholder');

  // Construire l'URL de l'image de fond si selectionnee
  var backgroundImageUrl = null;
  if (selectedBackgroundId) {
    var photo = backgroundPhotos.find(function(p) { return p.id === selectedBackgroundId; });
    if (photo) backgroundImageUrl = photo.imageUrl;
  }

  if (!date || !lat || !lng) return;

  if (previewAbort) previewAbort.abort();
  previewAbort = new AbortController();

  if (previewImg) previewImg.style.opacity = '0.5';
  if (previewPlaceholder) previewPlaceholder.style.display = 'none';

  try {
    var res = await fetch('/api/sky-map/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: date, time: time || '21:00',
        lat: lat, lng: lng,
        title: title, subtitle: subtitle,
        location_name: location_name,
        style: style,
        backgroundImageUrl: backgroundImageUrl,
        starDensity: sphere.starDensity,
        showConstellationLabels: sphere.showConstellationLabels
      }),
      signal: previewAbort.signal
    });
    if (!res.ok) return;
    var data = await res.json();

    if (previewPlaceholder) previewPlaceholder.style.display = 'none';

    // Le SVG est en data URL - on le charge dans un object URL pour eviter
    // les restrictions de <img src=data:svg> (masques/images internes bloques)
    if (previewSvgUrl) URL.revokeObjectURL(previewSvgUrl);
    var byteChars = atob(data.svgDataUrl.split(',')[1]);
    var byteNumbers = new Array(byteChars.length);
    for (var i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    var byteArray = new Uint8Array(byteNumbers);
    var blob = new Blob([byteArray], { type: 'image/svg+xml' });
    previewSvgUrl = URL.createObjectURL(blob);

    if (previewImg) { previewImg.src = previewSvgUrl; previewImg.style.display = 'block'; previewImg.style.opacity = '1'; }
    var previewDiv = document.getElementById('preview-container');
    if (previewDiv) previewDiv.style.display = 'none';
  } catch(e) { if (e.name !== 'AbortError') console.warn('Preview error', e.message); }
}

function generatePreview() {
  var date = document.getElementById('creator-date') ? document.getElementById('creator-date').value : '';
  var lat = parseFloat(document.getElementById('creator-lat') ? document.getElementById('creator-lat').value : '0');
  if (!date || !lat) {
    showToast(tr('creator.fill_date_place', 'Remplissez d abord la date et le lieu'), 'error');
    return;
  }
  updatePreview();
  // Montrer le bouton premium une fois le preview standard chargÃ©
  document.getElementById('btn-premium').style.display = 'block';
}

var premiumSvgUrl = null;
var premiumAbort = null;
var lastPremiumSvgDataUrl = null;

function openPremiumModal(svgDataUrl) {
  var modal = document.getElementById('premium-modal');
  if (!modal) return;
  var img = document.getElementById('premium-img');
  if (!img) return;

  var byteChars = atob(svgDataUrl.split(',')[1]);
  var byteNumbers = new Array(byteChars.length);
  for (var i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  var byteArray = new Uint8Array(byteNumbers);
  var blob = new Blob([byteArray], { type: 'image/svg+xml' });
  if (premiumSvgUrl) URL.revokeObjectURL(premiumSvgUrl);
  premiumSvgUrl = URL.createObjectURL(blob);
  img.src = premiumSvgUrl;
  modal.style.display = 'flex';
}

function closePremiumModal() {
  var modal = document.getElementById('premium-modal');
  if (modal) modal.style.display = 'none';
}

async function generatePremiumPreview() {
  var date = document.getElementById('creator-date') ? document.getElementById('creator-date').value : '';
  var time = document.getElementById('creator-time') ? document.getElementById('creator-time').value : '';
  var lat = parseFloat(document.getElementById('creator-lat') ? document.getElementById('creator-lat').value : '0');
  var lng = parseFloat(document.getElementById('creator-lng') ? document.getElementById('creator-lng').value : '0');
  var location_name = document.getElementById('creator-location') ? document.getElementById('creator-location').value : '';
  var title = document.getElementById('creator-title') ? document.getElementById('creator-title').value : '';
  var subtitle = document.getElementById('creator-subtitle') ? document.getElementById('creator-subtitle').value : '';
  var styleEl = document.querySelector('.style-option input:checked');
  var style = styleEl ? styleEl.value : 'dark';
  var sphere = getSkySphereOptions();
  var backgroundImageUrl = null;
  if (selectedBackgroundId) {
    var photo = backgroundPhotos.find(function(p) { return p.id === selectedBackgroundId; });
    if (photo) backgroundImageUrl = photo.imageUrl;
  }

  if (!date || !lat || !lng) {
    showToast(tr('creator.generate_std_first', 'Generer d abord un apercu standard'), 'error');
    return;
  }

  if (premiumAbort) premiumAbort.abort();
  premiumAbort = new AbortController();

  try {
    var res = await fetch('/api/sky-map/preview-premium', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: date, time: time || '21:00',
        lat: lat, lng: lng,
        title: title, subtitle: subtitle,
        location_name: location_name,
        style: style,
        backgroundImageUrl: backgroundImageUrl,
        starDensity: sphere.starDensity,
        showConstellationLabels: sphere.showConstellationLabels
      }),
      signal: premiumAbort.signal
    });
    if (!res.ok) return;
    var data = await res.json();
    lastPremiumSvgDataUrl = data.svgDataUrl; // Sauvegarde pour le panier
    // Persist in sessionStorage as fallback so it survives page refresh before "Valider"
    sessionStorage.setItem('previewSvgData', data.svgDataUrl);
    openPremiumModal(data.svgDataUrl);
  } catch(e) { if (e.name !== 'AbortError') console.warn('Premium preview error', e.message); }
}


async function handleCreatorSubmit(e) {
  e.preventDefault();
  if (!currentUser) {
    window.location.href = '/login?next=/cart';
    return;
  }

  var date = document.getElementById('creator-date') ? document.getElementById('creator-date').value : '';
  var time = document.getElementById('creator-time') ? document.getElementById('creator-time').value : '';
  var lat = parseFloat(document.getElementById('creator-lat') ? document.getElementById('creator-lat').value : '0');
  var lng = parseFloat(document.getElementById('creator-lng') ? document.getElementById('creator-lng').value : '0');
  var location_name = document.getElementById('creator-location') ? document.getElementById('creator-location').value : '';
  var title = document.getElementById('creator-title') ? document.getElementById('creator-title').value : 'Ma Carte du Ciel';
  var subtitle = document.getElementById('creator-subtitle') ? document.getElementById('creator-subtitle').value : '';
  var styleEl = document.querySelector('.style-option input:checked');
  var style = styleEl ? styleEl.value : 'dark';
  var sphere = getSkySphereOptions();
  var backgroundImageUrl = null;
  if (selectedBackgroundId) {
    var photo = backgroundPhotos.find(function(p) { return p.id === selectedBackgroundId; });
    if (photo) backgroundImageUrl = photo.imageUrl;
  }
  var orientationEl = document.querySelector('.orientation-option input:checked');
  var orientation = orientationEl ? orientationEl.value : 'vertical';

  if (!date || !lat || !lng) { showToast(tr('creator.fill_required', 'Remplissez tous les champs obligatoires'), 'error'); return; }

  // Generer le HTML de la carte et le sauvegarder AVANT d'ajouter au panier
  // pour que le clic dans le panier ouvre /final-preview (pas /build-map)
  var cardPreviewId = 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  var footerLine = [date + (time ? ' ' + time : ''), location_name].filter(Boolean).join('  Â·  ');

  try {
    var previewRes = await fetch('/api/sky-map/preview-premium', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: date, time: time || '21:00',
        lat: lat, lng: lng,
        title: title, subtitle: subtitle,
        location_name: location_name,
        style: style,
        backgroundImageUrl: backgroundImageUrl,
        orientation: orientation,
        starDensity: sphere.starDensity,
        showConstellationLabels: sphere.showConstellationLabels
      })
    });

    if (previewRes.ok) {
      var previewData = await previewRes.json();
      var svgDataUrl = previewData.svgDataUrl;
      // Construire le HTML de la carte (meme rendu que final-preview.html)
      var cardHtml = buildCardHtml(title, subtitle, footerLine, style, orientation, svgDataUrl, backgroundImageUrl);
      // SessionStorage uniquement â€” les HTML sont trop volumineux pour localStorage (quota)
      sessionStorage.setItem('cardPreviewHtml_' + cardPreviewId, '<div style="margin:0;padding:0">' + cardHtml + '</div>');
      sessionStorage.setItem('cardPreviewClean_' + cardPreviewId, svgDataUrl);
      // UTILISER svgDataUrl RECU DE L'API comme source validee pour le panier
      lastPremiumSvgDataUrl = svgDataUrl;
    }
  } catch(ex) {
    console.warn('Preview generation failed for cart save', ex);
  }

  // Sauvegarder cardPreviewId en sessionStorage pour reutilisation eventuelle du flux carte
  // meme apres un refresh navigateur (sessionStorage persiste sur la meme session)
  sessionStorage.setItem('cardPreviewId', cardPreviewId);

  var metadata = {
    date: date, time: time, lat: lat, lng: lng,
    location_name: location_name, title: title, subtitle: subtitle,
    style: style, orientation: orientation,
    starDensity: sphere.starDensity,
    showConstellationLabels: sphere.showConstellationLabels,
    cardPreviewId: cardPreviewId
  };
  if (selectedBackgroundId) metadata.backgroundPhotoId = selectedBackgroundId;
  if (backgroundImageUrl) metadata.backgroundImageUrl = backgroundImageUrl;
  if (lastPremiumSvgDataUrl) metadata.previewSvgDataUrl = lastPremiumSvgDataUrl;

  var res = await fetch('/api/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'sky_map',
      title: title,
      price: SKY_MAP_PRICE,
      metadata: metadata
    })
  });

  if (!res.ok) { showToast(tr('creator.add_failed', 'Erreur lors de lajout au panier'), 'error'); return; }

  var data = await res.json();
  cart = data.cart;
  updateCartCount();
  showToast(tr('creator.added', 'Carte ajoutee au panier !'));
  setTimeout(function() { window.location.href = '/cart'; }, 800);
}

// Helper: construit le HTML de la carte (meme logique que final-preview.html)
function buildCardHtml(title, subtitle, footerLine, style, orientation, svgDataUrl, bgUrl) {
  var STYLE_COLORS = {
    dark: { bg1: '#060c18', bg2: '#0a1628', textColor: '#c8ddf5', subtitleColor: '#7a9cc0', accentColor: 'rgba(74,144,217,0.55)', shadowColor: 'rgba(0,0,0,0.65)' },
    light: { bg1: '#faf8f2', bg2: '#ede8da', textColor: '#1a1a2e', subtitleColor: '#4a4a6a', accentColor: 'rgba(58,90,138,0.55)', shadowColor: 'rgba(0,0,0,0.18)' },
    art: { bg1: '#0d1830', bg2: '#1a0a2e', textColor: '#e8d5ff', subtitleColor: '#b8a0d0', accentColor: 'rgba(136,170,255,0.55)', shadowColor: 'rgba(0,0,0,0.65)' }
  };
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  var C = STYLE_COLORS[style] || STYLE_COLORS.dark;
  var hasBg = !!bgUrl;
  var isVert = orientation === 'vertical';
  var scale = isVert ? 1.4 : 1.2;

  if (isVert) {
    var cardW = Math.round(340 * scale), cardH = Math.round(520 * scale);
    var r = Math.round(116 * scale), cx = cardW / 2, cy = Math.round(155 * scale);
    var textY = cy + r + Math.round(22 * scale);
    var cardBgStyle = hasBg ? 'background:url(' + bgUrl + ') center center / cover no-repeat;' : 'background:linear-gradient(165deg,' + C.bg1 + ',' + C.bg2 + ');';
    var html = '<div style="display:inline-block;width:' + cardW + 'px;height:' + cardH + 'px;' + cardBgStyle + 'border-radius:14px;overflow:hidden;position:relative;box-shadow:0 20px 80px ' + C.shadowColor + ';border:1px solid rgba(74,144,217,0.16);">';
    if (hasBg) html += '<div style="position:absolute;inset:0;background:linear-gradient(165deg,rgba(0,0,0,0.5),rgba(0,0,0,0.25));border-radius:14px;pointer-events:none;"></div>';
    html += '<div style="position:absolute;left:' + (cx - r) + 'px;top:' + (cy - r) + 'px;width:' + (r*2) + 'px;height:' + (r*2) + 'px;border-radius:50%;overflow:hidden;border:2px solid ' + C.accentColor + ';box-shadow:0 0 0 1px rgba(74,144,217,0.1),0 10px 40px ' + C.shadowColor + ',0 0 60px rgba(74,144,217,0.15);"><img src="' + svgDataUrl + '" style="width:100%;height:100%;object-fit:cover;display:block" alt=""></div>';
    if (title || subtitle || footerLine) html += '<div style="position:absolute;top:' + (textY - Math.round(14 * scale)) + 'px;left:' + Math.round(20 * scale) + 'px;right:' + Math.round(20 * scale) + 'px;height:1px;background:linear-gradient(to right,transparent,' + C.accentColor + ',transparent);"></div>';
    if (title) { html += '<div style="position:absolute;top:' + textY + 'px;left:' + Math.round(18 * scale) + 'px;right:' + Math.round(18 * scale) + 'px;text-align:center;font-family:\'Cinzel\',serif;font-size:' + (1.0 * scale).toFixed(2) + 'rem;font-weight:600;color:' + C.textColor + ';line-height:1.3;letter-spacing:.04em;text-shadow:0 2px 10px ' + C.shadowColor + '">' + esc(title) + '</div>'; textY += Math.round(34 * scale); }
    if (subtitle) { html += '<div style="position:absolute;top:' + textY + 'px;left:' + Math.round(18 * scale) + 'px;right:' + Math.round(18 * scale) + 'px;text-align:center;font-family:\'Montserrat\',sans-serif;font-size:' + (0.78 * scale).toFixed(2) + 'rem;font-style:italic;color:' + C.subtitleColor + ';line-height:1.4;text-shadow:0 1px 5px ' + C.shadowColor + '">' + esc(subtitle) + '</div>'; textY += Math.round(26 * scale); }
    if (footerLine) html += '<div style="position:absolute;top:' + (textY + Math.round(4 * scale)) + 'px;left:' + Math.round(18 * scale) + 'px;right:' + Math.round(18 * scale) + 'px;text-align:center;font-family:\'Montserrat\',sans-serif;font-size:' + (0.6 * scale).toFixed(2) + 'rem;font-weight:300;letter-spacing:.08em;color:' + C.subtitleColor + ';opacity:.65;text-shadow:0 1px 4px ' + C.shadowColor + '">' + esc(footerLine) + '</div>';
    html += '<div style="position:absolute;left:' + (cx - r - 1) + 'px;top:' + (cy - r - 1) + 'px;width:' + (r*2+2) + 'px;height:' + (r*2+2) + 'px;border-radius:50%;box-shadow:0 0 0 1.5px ' + C.accentColor + ',0 0 0 3px rgba(74,144,217,0.07);pointer-events:none;"></div>';
    html += '<div style="position:absolute;bottom:' + Math.round(10 * scale) + 'px;right:' + Math.round(12 * scale) + 'px;font-family:\'Montserrat\',sans-serif;font-size:' + (0.52 * scale).toFixed(2) + 'rem;letter-spacing:.12em;text-transform:uppercase;color:' + C.subtitleColor + ';opacity:.28;text-shadow:0 1px 4px ' + C.shadowColor + '">Sky Store</div>';
    html += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;border-radius:14px;"><div style="font-family:\'Montserrat\',sans-serif;font-size:' + (3.5 * scale).toFixed(1) + 'rem;font-weight:700;letter-spacing:.3em;color:rgba(255,255,255,.28);text-transform:uppercase;transform:rotate(-25deg);white-space:nowrap;user-select:none;text-shadow:0 2px 12px rgba(0,0,0,.5)">SKY STORE</div></div>';
    html += '</div>';
    return html;
  } else {
    var cardW = Math.round(640 * scale), cardH = Math.round(340 * scale);
    var r = Math.round(130 * scale), cy = cardH / 2;
    var leftEnd = cardH + Math.round(10 * scale);
    var textX = leftEnd + Math.round(32 * scale);
    var cardBgStyleH = hasBg ? 'background:url(' + bgUrl + ') center center / cover no-repeat;' : 'background:linear-gradient(130deg,' + C.bg1 + ' 0%,' + C.bg2 + ' 100%);';
    var html = '<div style="display:inline-block;width:' + cardW + 'px;height:' + cardH + 'px;' + cardBgStyleH + 'border-radius:14px;overflow:hidden;position:relative;box-shadow:0 20px 80px ' + C.shadowColor + ';border:1px solid rgba(74,144,217,0.16);">';
    if (hasBg) html += '<div style="position:absolute;inset:0;background:linear-gradient(130deg,rgba(0,0,0,0.45),rgba(0,0,0,0.2));border-radius:14px;pointer-events:none;"></div>';
    html += '<div style="position:absolute;left:' + (cy - r) + 'px;top:' + (cy - r) + 'px;width:' + (r*2) + 'px;height:' + (r*2) + 'px;border-radius:50%;overflow:hidden;border:2px solid ' + C.accentColor + ';box-shadow:0 0 0 1px rgba(74,144,217,0.08),0 10px 40px ' + C.shadowColor + ',0 0 60px rgba(74,144,217,0.12);"><img src="' + svgDataUrl + '" style="width:100%;height:100%;object-fit:cover;display:block" alt=""></div>';
    html += '<div style="position:absolute;left:' + (leftEnd - 1) + 'px;top:' + Math.round(40 * scale) + 'px;bottom:' + Math.round(40 * scale) + 'px;width:1px;background:linear-gradient(to bottom,transparent,' + C.accentColor + ',transparent);opacity:.4;"></div>';
    var textBlockLeft = leftEnd + Math.round(16 * scale), textBlockRight = Math.round(24 * scale);
    html += '<div style="position:absolute;top:' + Math.round(40 * scale) + 'px;left:' + textBlockLeft + 'px;right:' + textBlockRight + 'px;bottom:' + Math.round(40 * scale) + 'px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;">';
    if (title) html += '<div style="font-family:\'Cinzel\',serif;font-size:' + (1.2 * scale).toFixed(2) + 'rem;font-weight:600;color:' + C.textColor + ';line-height:1.25;letter-spacing:.03em;text-shadow:0 2px 12px ' + C.shadowColor + ';text-align:center;width:100%">' + esc(title) + '</div>';
    if (subtitle) html += '<div style="font-family:\'Montserrat\',sans-serif;font-size:' + (0.85 * scale).toFixed(2) + 'rem;font-style:italic;color:' + C.subtitleColor + ';line-height:1.4;text-shadow:0 1px 6px ' + C.shadowColor + ';text-align:center;margin-top:' + (title ? Math.round(10 * scale) : 0) + 'px;width:100%">' + esc(subtitle) + '</div>';
    if (footerLine) html += '<div style="font-family:\'Montserrat\',sans-serif;font-size:' + (0.62 * scale).toFixed(2) + 'rem;font-weight:300;letter-spacing:.08em;color:' + C.subtitleColor + ';opacity:.65;text-shadow:0 1px 4px ' + C.shadowColor + ';text-align:center;margin-top:' + ((title||subtitle) ? Math.round(8 * scale) : 0) + 'px;width:100%">' + esc(footerLine) + '</div>';
    html += '</div>';
    html += '<div style="position:absolute;left:' + (cy - r - 1) + 'px;top:' + (cy - r - 1) + 'px;width:' + (r*2+2) + 'px;height:' + (r*2+2) + 'px;border-radius:50%;box-shadow:0 0 0 1.5px ' + C.accentColor + ',0 0 0 3px rgba(74,144,217,0.07);pointer-events:none;"></div>';
    html += '<div style="position:absolute;bottom:' + Math.round(10 * scale) + 'px;right:' + Math.round(12 * scale) + 'px;font-family:\'Montserrat\',sans-serif;font-size:' + (0.52 * scale).toFixed(2) + 'rem;letter-spacing:.12em;text-transform:uppercase;color:' + C.subtitleColor + ';opacity:.28;text-shadow:0 1px 4px ' + C.shadowColor + '">Sky Store</div>';
    html += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;border-radius:14px;"><div style="font-family:\'Montserrat\',sans-serif;font-size:' + (3.5 * scale).toFixed(1) + 'rem;font-weight:700;letter-spacing:.3em;color:rgba(255,255,255,.28);text-transform:uppercase;transform:rotate(-25deg);white-space:nowrap;user-select:none;text-shadow:0 2px 12px rgba(0,0,0,.5)">SKY STORE</div></div>';
    html += '</div>';
    return html;
  }
}

// GALLERY
async function renderGalleryPage() {
  var container = document.getElementById('gallery-grid');
  if (!container) return;
  var res = await fetch('/api/photos');
  var photos = await res.json();
  container.innerHTML = photos.map(function(p) {
    return '<div class="photo-card" onclick="openPhotoModal(\'' + p.id + '\')" data-category="' + (p.category || '') + '">' +
      '<div class="photo-thumb"><img src="' + p.thumbUrl + '" alt="' + p.title + '" loading="lazy"></div>' +
      '<div class="photo-info"><strong>' + p.title + '</strong><span>' + (p.price / 100).toFixed(2) + '$</span></div></div>';
  }).join('');

  var filterBar = document.getElementById('gallery-filters');
  if (filterBar && photos.length) {
    var cats = [...new Set(photos.map(function(p) { return p.category; }).filter(Boolean))];
    filterBar.innerHTML = '<button class="filter-btn active" onclick="filterGallery(\'\', this)">Tout</button>' +
      cats.map(function(c) { return '<button class="filter-btn" onclick="filterGallery(\'' + c + '\', this)">' + c + '</button>'; }).join('');
  }
}

function filterGallery(cat, btn) {
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.photo-card').forEach(function(card) {
    card.style.display = !cat || card.dataset.category === cat ? '' : 'none';
  });
}

async function openPhotoModal(id) {
  var res = await fetch('/api/photos/' + id);
  if (!res.ok) return;
  var p = await res.json();
  var modal = document.getElementById('photo-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'photo-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal" style="max-width:700px">' +
      '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').classList.remove(\'open\')">&times;</button>' +
      '<div style="position:relative;border-radius:8px;overflow:hidden;margin-bottom:16px">' +
      '<img class="modal-photo-img" style="width:100%;max-height:400px;object-fit:cover;display:block">' +
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;background:linear-gradient(140deg,rgba(10,15,30,0.08),rgba(10,15,30,0.18));">' +
      '<span style="font-family:\'Montserrat\',Arial,sans-serif;font-size:clamp(11px,2vw,13px);font-weight:600;letter-spacing:.22em;color:rgba(255,255,255,.3);text-transform:uppercase;transform:rotate(-24deg);text-shadow:0 1px 6px rgba(0,0,0,.45);white-space:nowrap;">SKY STORE  SKY STORE  SKY STORE</span>' +
      '</div></div>' +
      '<h3 class="modal-photo-title" style="margin-bottom:8px"></h3>' +
      '<p class="modal-photo-desc" style="margin-bottom:16px;font-size:.9rem"></p>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">' +
      '<span class="modal-photo-price" style="font-size:1.4rem;font-weight:700;color:var(--accent2)"></span>' +
      '<button class="btn btn-primary" onclick="addPhotoToCart()">Ajouter au panier</button></div></div>';
    document.body.appendChild(modal);
  }
  modal.querySelector('.modal-photo-img').src = p.imageUrl || p.thumbUrl;
  modal.querySelector('.modal-photo-title').textContent = p.title;
  modal.querySelector('.modal-photo-desc').textContent = p.description || '';
  modal.querySelector('.modal-photo-price').textContent = (p.price / 100).toFixed(2) + '$ CAD';
  modal.dataset.photoId = p.id;
  modal.dataset.photoTitle = p.title;
  modal.dataset.photoPrice = p.price;
  modal.classList.add('open');
}

async function addPhotoToCart() {
  var modal = document.getElementById('photo-modal');
  if (!modal) return;
  await addToCart({
    type: 'photo',
    title: modal.dataset.photoTitle,
    price: parseInt(modal.dataset.photoPrice, 10),
    metadata: { photoId: modal.dataset.photoId }
  });
  modal.classList.remove('open');
}

// ACCOUNT
async function renderAccountPage() {
  if (!currentUser) { window.location.href = '/login'; return; }
  var nameEl = document.getElementById('account-name');
  if (nameEl) nameEl.textContent = currentUser.name;
  document.querySelectorAll('.account-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.account-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.account-section').forEach(function(s) { s.classList.add('hidden'); });
      tab.classList.add('active');
      var sec = document.getElementById('section-' + tab.dataset.section);
      if (sec) sec.classList.remove('hidden');
    });
  });
  loadOrders();
}

async function deleteOrder(orderId) {
  var res = await fetch('/api/orders/' + orderId, { method: 'DELETE', credentials: 'same-origin' });
  if (res.ok) {
    showToast(tr('orders.deleted', 'Commande supprimee'));
    loadOrders();
  } else {
    var data = await res.json();
    showToast(data.error || tr('ui.error', 'Erreur'), 'error');
  }
}

async function loadOrders() {
  var res = await fetch('/api/orders');
  if (!res.ok) return;
  var data = await res.json();
  var container = document.getElementById('orders-list');
  if (!container) return;
  if (!data.orders || !data.orders.length) {
    container.innerHTML = '<p style="color:var(--text-muted)">' + tr('orders.none', 'Aucune commande.') + '</p>';
    return;
  }

  // Construire la liste complete des items avec preview
  var allItems = [];
  for (var oi = 0; oi < data.orders.length; oi++) {
    var order = data.orders[oi];
    for (var ji = 0; ji < order.items.length; ji++) {
      var item = order.items[ji];
      // Le token est desormai attache directement a l'item (order_item_id)
      allItems.push({ order: order, item: item });
    }
  }

  // Charger les apercus en parallele
  var previewPromises = allItems.map(function(info) {
    if (info.item.product_type === 'sky_map') {
      var meta = info.item.metadata || {};
      // Priorite 1: fichier deja genere (livraison terminee)
      if (meta.imagePath) {
        return Promise.resolve({ imagePath: meta.imagePath });
      }
      // Priorite 2: SVG propre valide stocke dans la commande (ne pas regenerer)
      if (meta.previewSvgDataUrl) {
        return Promise.resolve({ svgDataUrl: meta.previewSvgDataUrl });
      }
      // Dernier recours: regenerer via l'API (seulement si aucune donnee stockee)
      return fetch('/api/sky-map/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: meta.date || '2024-01-01',
          time: meta.time || '21:00',
          lat: meta.lat || 45,
          lng: meta.lng || -73,
          title: meta.title || info.item.product_title,
          subtitle: meta.subtitle || '',
          location_name: meta.location_name || '',
          style: meta.style || 'dark'
        })
      }).then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    } else if (info.item.product_type === 'photo' || info.item.product_type === 'bonus_photo') {
      var photoId = (info.item.metadata || {}).photoId;
      if (photoId) {
        return Promise.resolve({ thumbUrl: '/api/photos/' + photoId + '/thumb', photoId: photoId });
      }
      return Promise.resolve(null);
    } else if (info.item.product_type === 'ambiance' || info.item.product_type === 'bonus_ambiance') {
      var bgUrl = (info.item.metadata || {}).backgroundImageUrl || (info.item.metadata || {}).thumbUrl || (info.item.metadata || {}).imageUrl;
      if (bgUrl) {
        return Promise.resolve({ thumbUrl: bgUrl });
      }
      return Promise.resolve(null);
    }
    return Promise.resolve(null);
  });

  var previews = await Promise.all(previewPromises);

  // Rendu de chaque commande
  var html = '';
  for (var oi = 0; oi < data.orders.length; oi++) {
    var order = data.orders[oi];
    var orderItems = allItems.filter(function(info) { return info.order.id === order.id; });

    // Indices dans allItems pour retrouver les previews
    var itemCardsHtml = '';
    for (var ji = 0; ji < orderItems.length; ji++) {
      var info = orderItems[ji];
      var item = info.item;
      var token = item.downloadToken;
      var expired = item.tokenExpired;
      var used = item.tokenUsed;
      var preview = previews[allItems.indexOf(info)];

      // Apercu HTML
      var thumbHtml = '<div class="product-card-thumb" style="background:var(--bg)"><span style="font-size:2rem;color:var(--text-muted)">&#9733;</span></div>';
      if (preview) {
        if (preview.thumbUrl) {
          thumbHtml = '<div class="product-card-thumb"><img src="' + preview.thumbUrl + '" alt="' + item.product_title + '" loading="lazy" onerror="this.style.display=\'none\'"></div>';
        } else if (preview.imagePath) {
          // Fichier SVG deja genere - servir via /storage/ (avec filigrane surcharge en CSS pour l'apercu)
          var storedFile = preview.imagePath.replace(/^.*[\\\/]/, '');
          thumbHtml = '<div class="product-card-thumb" style="background:#060c18;padding:0"><img src="/storage/preview/' + storedFile + '" alt="' + item.product_title + '" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display=\'none\'"></div>';
        } else if (preview.svgDataUrl) {
          // SVG en inline data URL
          thumbHtml = '<div class="product-card-thumb" style="background:#060c18;padding:0"><img src="' + preview.svgDataUrl + '" alt="' + item.product_title + '" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.parentElement.style.background=\'var(--bg)\'"></div>';
        }
      }

      // Badge type
      var typeLabel = 'Produit';
      if (item.product_type === 'sky_map') typeLabel = 'Carte du ciel';
      else if (item.product_type === 'photo' || item.product_type === 'bonus_photo') typeLabel = 'Photo';
      else if (item.product_type === 'ambiance' || item.product_type === 'bonus_ambiance') typeLabel = 'Ambiance';
      var bonusTag = item.is_bonus ? ' <span style="background:rgba(61,186,120,.15);color:#3dba78;padding:2px 8px;border-radius:10px;font-size:.7rem;margin-left:6px">GRATUIT</span>' : '';

      // Statut
      var statusLabel = order.status === 'delivered' ? 'Pret' : order.status === 'pending' ? 'En cours' : order.status;

      // Prix
      var priceText = item.price === 0 ? 'Gratuit' : (item.price / 100).toFixed(2) + '$ CAD';

      // Telechargement
      var actionHtml = '';
      if (token && !expired && !used) {
        if (item.product_type === 'sky_map') {
          actionHtml = '<a href="/api/download/' + token + '" class="btn btn-sm btn-primary" download>PNG</a>';
        } else if (item.product_type === 'ambiance' || item.product_type === 'bonus_ambiance') {
          actionHtml = '<a href="/api/download/' + token + '" class="btn btn-sm btn-primary" download>Telecharger ambiance</a>';
        } else {
          actionHtml = '<a href="/api/download/' + token + '" class="btn btn-sm btn-primary" download>Telecharger</a>';
        }
      } else if (token && used) {
        if (item.product_type === 'sky_map') {
          actionHtml = '<a href="/api/download/' + token + '" class="btn btn-sm btn-ghost" style="opacity:.6" download>PNG</a>';
        } else if (item.product_type === 'ambiance' || item.product_type === 'bonus_ambiance') {
          actionHtml = '<a href="/api/download/' + token + '" class="btn btn-sm btn-ghost" style="opacity:.5" download>Ambiance</a>';
        } else {
          actionHtml = '<a href="/api/download/' + token + '" class="btn btn-sm btn-ghost" style="opacity:.5" download>Deja telecharge</a>';
        }
      } else if (token && expired) {
        actionHtml = '<span style="color:var(--text-muted);font-size:.8rem">Expire</span>';
      } else {
        actionHtml = '<span style="color:var(--text-muted);font-size:.8rem">Non disponible</span>';
      }

      itemCardsHtml +=
        '<div class="product-card">' +
          thumbHtml +
          '<div class="product-card-info">' +
            '<div class="product-card-name">' + item.product_title + bonusTag + '</div>' +
            '<div class="product-card-meta">' + typeLabel + ' &middot; ' + priceText + ' &middot; <span class="status-badge status-' + order.status + '">' + statusLabel + '</span></div>' +
            '<div class="product-card-actions">' + actionHtml + '</div>' +
          '</div>' +
        '</div>';
    }

    var delBtn = order.status !== 'delivered'
      ? '<button class="btn btn-sm btn-danger" style="margin-left:8px" onclick="if(confirm(\'Voulez-vous vraiment supprimer cette commande ?\')){deleteOrder(' + order.id + ');}">Supprimer</button>'
      : '';

    html +=
      '<div class="order-card">' +
        '<div class="order-card-header">' +
          '<div><strong>Commande #' + order.id + '</strong> <span style="margin-left:12px;color:var(--text-muted);font-size:.85rem">' + new Date(order.created_at).toLocaleDateString('fr-FR') + '</span></div>' +
          '<div style="display:flex;align-items:center;gap:8px"><span class="status-badge status-' + order.status + '">' + (order.status === 'delivered' ? 'Livre' : order.status === 'pending' ? 'En cours' : order.status) + '</span>' + delBtn + '</div>' +
        '</div>' +
        '<div class="product-cards">' + itemCardsHtml + '</div>' +
      '</div>';
  }

  container.innerHTML = html;
}

// ADMIN
async function renderAdminPage() {
  if (!currentUser || !currentUser.is_admin) { window.location.href = '/'; return; }
  document.querySelectorAll('.admin-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.admin-section').forEach(function(s) { s.classList.add('hidden'); });
      tab.classList.add('active');
      var sec = document.getElementById('admin-' + tab.dataset.section);
      if (sec) sec.classList.remove('hidden');
    });
  });
  loadAdminOrders();
  loadAdminStats();
  loadAdminUsers();
}

async function loadAdminUsers() {
  var res = await fetch('/api/admin/users');
  var data = await res.json();
  var container = document.getElementById('admin-users-list');
  var detail = document.getElementById('admin-user-detail');
  if (!container) return;
  if (!res.ok) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px">' + tr('admin.access_denied', 'Acces refuse.') + '</p>';
    if (detail) detail.style.display = 'none';
    return;
  }
  if (!data.users || !data.users.length) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px">' + tr('admin.no_users', 'Aucun utilisateur.') + '</p>';
    if (detail) detail.style.display = 'none';
    return;
  }
  var rows = data.users.map(function(u) {
    return '<tr>' +
      '<td><strong>#' + u.id + '</strong></td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="viewAdminUser(' + u.id + ')">' + (u.name || '-') + '</button></td>' +
      '<td>' + (u.email || '-') + '</td>' +
      '<td>' + (u.is_admin ? 'Oui' : 'Non') + '</td>' +
      '<td>' + (u.created_at ? new Date(u.created_at).toLocaleString('fr-FR') : '-') + '</td>' +
      '</tr>';
  }).join('');
  container.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Nom</th><th>Email</th><th>Admin</th><th>Creation</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  if (detail) {
    detail.style.display = 'block';
    detail.innerHTML = '<div class="alert" style="margin-top:10px">' + tr('admin.click_user', 'Clique sur un utilisateur pour voir sa fiche et ses commandes.') + '</div>';
  }
}

function adminEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function viewAdminUser(userId) {
  var detail = document.getElementById('admin-user-detail');
  if (!detail) return;
  detail.style.display = 'block';
  detail.innerHTML = '<p style="color:var(--text-muted);padding:12px">' + tr('admin.loading_user', 'Chargement utilisateur #{id}...', { id: userId }) + '</p>';

  var res = await fetch('/api/admin/users/' + userId);
  var data = await res.json();
  if (!res.ok) {
    detail.innerHTML = '<p style="color:var(--danger);padding:12px">' + adminEscape(data.error || tr('ui.error', 'Erreur')) + '</p>';
    return;
  }

  var u = data.user || {};
  var summary = data.summary || {};
  var orders = data.orders || [];

  var ordersHtml = '';
  if (!orders.length) {
    ordersHtml = '<p style="color:var(--text-muted);padding:12px 0">' + tr('admin.no_user_orders', 'Aucune commande pour cet utilisateur.') + '</p>';
  } else {
    ordersHtml = orders.map(function(o) {
      var orderDate = o.created_at ? new Date(o.created_at).toLocaleString('fr-FR') : '-';
      var status = adminEscape(o.status || '-');
      var totalText = '$' + ((o.total || 0) / 100).toFixed(2) + ' CAD';
      var items = o.items || [];
      var itemsHtml = items.length
        ? items.map(function(i) {
          var isCard = i.product_type === 'sky_map';
          var typeLabel = isCard ? 'Carte' : 'Photo';
          var priceText = (i.price || 0) === 0 ? 'Gratuit' : ('$' + ((i.price || 0) / 100).toFixed(2) + ' CAD');
          var itemDate = i.created_at ? new Date(i.created_at).toLocaleString('fr-FR') : orderDate;
          var openBtn = '';
          var downloadBtn = '';
          if (isCard) {
            openBtn = '<a href="/api/admin/order-items/' + i.id + '/open" target="_blank" rel="noopener" class="btn btn-sm btn-ghost">Ouvrir carte</a>';
            downloadBtn = '<a href="/api/admin/order-items/' + i.id + '/download" class="btn btn-sm btn-primary">Re-telecharger</a>';
          } else {
            downloadBtn = '<a href="/api/admin/order-items/' + i.id + '/download" class="btn btn-sm btn-primary">Telecharger</a>';
          }
          return '' +
            '<div style="border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--bg2);margin-top:10px">' +
              '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
                '<div>' +
                  '<div style="font-weight:600">' + adminEscape(i.product_title || '-') + '</div>' +
                  '<div style="font-size:.85rem;color:var(--text-muted);margin-top:4px">' + typeLabel + ' · ' + priceText + ' · ' + itemDate + '</div>' +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + openBtn + downloadBtn + '</div>' +
              '</div>' +
            '</div>';
        }).join('')
        : '<p style="color:var(--text-muted);margin:10px 0 0 0">' + tr('admin.no_item', 'Aucun item.') + '</p>';

      return '' +
        '<div class="card" style="padding:14px 16px;margin-top:14px;border:1px solid var(--border)">' +
          '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">' +
            '<div><strong>Commande #' + o.id + '</strong> <span style="color:var(--text-muted);font-size:.9rem;margin-left:8px">' + orderDate + '</span></div>' +
            '<div style="display:flex;align-items:center;gap:10px"><span class="status-badge status-' + status + '">' + status + '</span><strong>' + totalText + '</strong></div>' +
          '</div>' +
          '<div style="margin-top:8px">' + itemsHtml + '</div>' +
        '</div>';
    }).join('');
  }

  detail.innerHTML =
    '<div class="card" style="padding:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<h3 style="margin:0">Fiche utilisateur #' + u.id + '</h3>' +
      '</div>' +
      '<p style="margin:10px 0 6px 0"><strong>Nom:</strong> ' + adminEscape(u.name || '-') + '</p>' +
      '<p style="margin:6px 0"><strong>Email:</strong> ' + adminEscape(u.email || '-') + '</p>' +
      '<p style="margin:6px 0"><strong>Admin:</strong> ' + (u.is_admin ? 'Oui' : 'Non') + '</p>' +
      '<p style="margin:6px 0"><strong>Creation:</strong> ' + (u.created_at ? new Date(u.created_at).toLocaleString('fr-FR') : '-') + '</p>' +
      '<p style="margin:6px 0"><strong>Nombre de commandes:</strong> ' + (summary.ordersCount || 0) + '</p>' +
      '<p style="margin:6px 0 14px 0"><strong>Total depense:</strong> $' + ((summary.totalSpent || 0) / 100).toFixed(2) + ' CAD</p>' +
      ordersHtml +
    '</div>';
}

async function loadAdminOrders() {
  var status = document.getElementById('filter-status') ? document.getElementById('filter-status').value : '';
  var from = document.getElementById('filter-from') ? document.getElementById('filter-from').value : '';
  var to = document.getElementById('filter-to') ? document.getElementById('filter-to').value : '';
  var url = '/api/admin/orders?';
  if (status) url += 'status=' + status + '&';
  if (from) url += 'from=' + from + '&';
  if (to) url += 'to=' + to + '&';
  var res = await fetch(url);
  var data = await res.json();
  var container = document.getElementById('admin-orders-list');
  if (!container) return;
  if (!data.orders || !data.orders.length) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px">' + tr('admin.no_orders', 'Aucune commande.') + '</p>';
    return;
  }
  var rows = data.orders.map(function(o) {
    var bonusTags = o.items.filter(function(i) { return i.is_bonus; }).map(function(b) {
      return '<span class="bonus-tag">' + b.product_title + '</span>';
    }).join('');
    var actionBtn = o.status === 'paid'
      ? '<button class="btn btn-sm" style="background:var(--success)" onclick="markDelivered(' + o.id + ')">Livrer</button>'
      : '-';
    return '<tr><td><strong>#' + o.id + '</strong></td><td>' + (o.customer_name || '-') + '<br><small style="color:var(--text-muted)">' + (o.customer_email || '') + '</small></td><td>$' + (o.total / 100).toFixed(2) + ' CAD</td><td><span class="status-badge status-' + o.status + '">' + o.status + '</span></td><td>' + (bonusTags || '-') + '</td><td>' + new Date(o.created_at).toLocaleDateString('fr-FR') + '</td><td>' + actionBtn + '</td></tr>';
  }).join('');
  container.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Client</th><th>Total</th><th>Statut</th><th>Bonus</th><th>Date</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

async function markDelivered(orderId) {
  var res = await fetch('/api/admin/orders/' + orderId + '/deliver', { method: 'POST' });
  if (res.ok) {
    showToast(tr('admin.delivered', 'Commande livree'));
    loadAdminOrders();
    loadAdminStats();
  } else {
    var data = await res.json();
    showToast(data.error || tr('ui.error', 'Erreur'), 'error');
  }
}

async function loadAdminStats() {
  var res = await fetch('/api/admin/stats');
  if (!res.ok) return;
  var s = await res.json();
  var el = document.getElementById('admin-stats');
  if (el) {
    el.innerHTML = '<div class="stat-item"><strong>' + (s.totalOrders || 0) + '</strong><span>Commandes</span></div>' +
      '<div class="stat-item"><strong>' + (s.paidOrders || 0) + '</strong><span>Payees</span></div>' +
      '<div class="stat-item"><strong>$' + ((s.totalRevenue || 0) / 100).toFixed(2) + '</strong><span>Revenu (CAD)</span></div>' +
      '<div class="stat-item"><strong>' + (s.totalUsers || 0) + '</strong><span>Utilisateurs</span></div>' +
      '<div class="stat-item"><strong>' + (s.totalPhotos || 0) + '</strong><span>Photos</span></div>' +
      '<div class="stat-item"><strong style="color:var(--success)">' + (s.bonusPhotosUsed || 0) + '</strong><span>Bonus utilises</span></div>';
  }
}

// TOAST
function showToast(msg, type) {
  type = type || 'success';
  var el = document.createElement('div');
  el.className = 'alert alert-' + (type === 'error' ? 'error' : 'success');
  el.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999;min-width:280px';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 4000);
}

// DEBOUNCE
function debounce(fn, ms) {
  var timer;
  return function() {
    var args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(null, args); }, ms);
  };
}

// Expose globally for inline handlers
window.doRegister = doRegister;
window.doLogin = doLogin;
window.doLogout = doLogout;
window.doForgotPassword = doForgotPassword;
window.doResetPassword = doResetPassword;
window.resendVerificationEmail = resendVerificationEmail;
window.removeCartItem = removeCartItem;
// selectBonusPhoto removed - function never existed (leftover from removed feature)
window.selectBackground = selectBackground;
window.filterGallery = filterGallery;
window.openPhotoModal = openPhotoModal;
window.addPhotoToCart = addPhotoToCart;
window.markDelivered = markDelivered;
window.deleteOrder = deleteOrder;
window.loadAdminOrders = loadAdminOrders;
window.viewAdminUser = viewAdminUser;
