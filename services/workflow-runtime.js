'use strict';

const { v4: uuidv4 } = require('uuid');
const { db } = require('./database');

const handlers = new Map();

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch (_) {
    return JSON.stringify({ unserializable: true });
  }
}

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(raw || 'null') ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function registerHandler(type, handler) {
  if (!type || typeof handler !== 'function') {
    throw new Error('registerHandler requires a type and function handler');
  }
  handlers.set(type, handler);
}

async function createJob({ type, tenantId, payload, correlationId, maxAttempts }) {
  const id = uuidv4();
  const stmt = await db.prepare(`
    INSERT INTO workflow_jobs (
      id, tenant_id, type, status, attempt_count, max_attempts, payload, correlation_id, last_error
    ) VALUES (?, ?, ?, 'queued', 0, ?, ?, ?, NULL)
  `);
  stmt.run(
    id,
    String(tenantId || 'public'),
    String(type),
    Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.floor(maxAttempts) : 2,
    safeJson(payload || {}),
    String(correlationId || '')
  );
  return id;
}

async function updateJobStatus(jobId, fields) {
  const setClauses = [];
  const params = [];
  Object.entries(fields || {}).forEach(([key, value]) => {
    setClauses.push(`${key} = ?`);
    params.push(value);
  });
  if (!setClauses.length) return;
  params.push(jobId);
  const stmt = await db.prepare(`UPDATE workflow_jobs SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
  stmt.run(...params);
}

async function getJob(jobId) {
  const stmt = await db.prepare('SELECT * FROM workflow_jobs WHERE id = ?');
  const row = stmt.get(jobId);
  if (!row) return null;
  return {
    ...row,
    payload: parseJson(row.payload, {}),
    result: parseJson(row.result, null)
  };
}

async function enqueueAndRun({ type, tenantId, payload, correlationId, maxAttempts = 2 }) {
  const handler = handlers.get(type);
  if (!handler) {
    throw new Error(`No workflow handler registered for type: ${type}`);
  }

  const jobId = await createJob({ type, tenantId, payload, correlationId, maxAttempts });
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await updateJobStatus(jobId, {
      status: 'running',
      attempt_count: attempt,
      started_at: new Date().toISOString(),
      last_error: null
    });

    try {
      const result = await handler(payload, { jobId, attempt, correlationId, tenantId });
      await updateJobStatus(jobId, {
        status: 'completed',
        result: safeJson(result || {}),
        finished_at: new Date().toISOString()
      });
      return getJob(jobId);
    } catch (err) {
      lastError = err;
      const nextStatus = attempt >= maxAttempts ? 'failed' : 'queued';
      await updateJobStatus(jobId, {
        status: nextStatus,
        last_error: String(err?.message || err || 'workflow_error')
      });
      if (attempt >= maxAttempts) {
        await updateJobStatus(jobId, { finished_at: new Date().toISOString() });
      }
    }
  }

  const failedJob = await getJob(jobId);
  const runtimeError = new Error(lastError?.message || 'Workflow execution failed');
  runtimeError.job = failedJob;
  throw runtimeError;
}

module.exports = {
  registerHandler,
  enqueueAndRun,
  getJob
};
