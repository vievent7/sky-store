'use strict';

const DEFAULT_TENANT_ID = String(process.env.DEFAULT_TENANT_ID || 'public').trim().toLowerCase() || 'public';
const ENABLE_SUBDOMAIN_TENANT = String(process.env.ENABLE_SUBDOMAIN_TENANT || 'false').trim().toLowerCase() === 'true';
const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

function normalizeTenantId(value) {
  const tenantId = String(value || '').trim().toLowerCase();
  if (!tenantId) return null;
  if (!TENANT_ID_PATTERN.test(tenantId)) return null;
  return tenantId;
}

function resolveTenantId(req) {
  const fromHeader = normalizeTenantId(req.get('x-tenant-id'));
  if (fromHeader) return { tenantId: fromHeader, source: 'header' };

  const fromQuery = normalizeTenantId(req.query?.tenant);
  if (fromQuery) return { tenantId: fromQuery, source: 'query' };

  const host = String(req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
  const hostname = host.split(':')[0];
  const hostParts = hostname.split('.').filter(Boolean);
  if (ENABLE_SUBDOMAIN_TENANT && hostParts.length >= 3) {
    const subdomain = normalizeTenantId(hostParts[0]);
    if (subdomain && !['www', 'app', 'api', 'localhost', '127'].includes(subdomain)) {
      return { tenantId: subdomain, source: 'subdomain' };
    }
  }

  return { tenantId: DEFAULT_TENANT_ID, source: 'default' };
}

function applyTenantContext(req, res, next) {
  const resolved = resolveTenantId(req);
  req.tenantId = resolved.tenantId;
  req.tenantSource = resolved.source;

  const sessionTenant = normalizeTenantId(req.session?.tenantId);
  if (sessionTenant && sessionTenant !== req.tenantId && req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Tenant context mismatch' });
  }

  return next();
}

module.exports = {
  DEFAULT_TENANT_ID,
  normalizeTenantId,
  resolveTenantId,
  applyTenantContext
};
