// ============================================================================
// CRM Event Bus — fires on every significant CRM action
// Checks automation_triggers table and dispatches matching Windmill flows.
// All dispatching is non-blocking (fire-and-forget) so CRM routes stay fast.
// ============================================================================

import WindmillService from './windmill.js';

// ---------------------------------------------------------------------------
// In-process listeners (for future internal hooks, not Windmill)
// ---------------------------------------------------------------------------
const listeners = new Map(); // eventName → Set<handler>

// ---------------------------------------------------------------------------
// Available event catalogue (for UI dropdowns)
// ---------------------------------------------------------------------------
const EVENT_CATALOGUE = {
  contacts: [
    { name: 'contact.created',        label: 'Contact Created' },
    { name: 'contact.updated',        label: 'Contact Updated' },
    { name: 'contact.deleted',        label: 'Contact Deleted' },
    { name: 'contact.bulk_created',   label: 'Contacts Bulk Created' },
  ],
  cases: [
    { name: 'case.created',           label: 'Case Created' },
    { name: 'case.updated',           label: 'Case Updated' },
    { name: 'case.status_changed',    label: 'Case Status Changed' },
    { name: 'case.bulk_status',       label: 'Cases Bulk Status Change' },
    { name: 'case.deleted',           label: 'Case Deleted' },
    { name: 'case.dsar_reset',        label: 'Case DSAR Reset' },
  ],
  documents: [
    { name: 'document.uploaded',      label: 'Document Uploaded' },
    { name: 'document.status_changed', label: 'Document Status Changed' },
    { name: 'document.deleted',       label: 'Document Deleted' },
  ],
  tasks: [
    { name: 'task.created',           label: 'Task Created' },
    { name: 'task.updated',           label: 'Task Updated' },
    { name: 'task.completed',         label: 'Task Completed' },
    { name: 'task.rescheduled',       label: 'Task Rescheduled' },
    { name: 'task.deleted',           label: 'Task Deleted' },
  ],
  communications: [
    { name: 'communication.created',  label: 'Communication Logged' },
    { name: 'note.created',           label: 'Note Created' },
    { name: 'note.updated',           label: 'Note Updated' },
    { name: 'note.deleted',           label: 'Note Deleted' },
  ],
};

// ---------------------------------------------------------------------------
// Condition matching — checks if event payload satisfies trigger conditions
// ---------------------------------------------------------------------------
function matchesConditions(conditions, payload) {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  for (const [key, expected] of Object.entries(conditions)) {
    const actual = payload.data?.[key] ?? payload[key];
    if (actual === undefined) return false;
    if (String(actual).toLowerCase() !== String(expected).toLowerCase()) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Initialise the event bus with the database pool.
 * Call once at server startup: `crmEvents.init(pool)`
 */
let _pool = null;

const crmEvents = {

  init(pool) {
    _pool = pool;
    console.log('[CRM Events] Event bus initialised');
  },

  /**
   * Emit a CRM event — non-blocking.
   * 1. Fires in-process listeners synchronously (wrapped in try/catch).
   * 2. Queries automation_triggers for matching active automations.
   * 3. Dispatches Windmill flows asynchronously (fire-and-forget).
   */
  emit(eventName, payload = {}) {
    const enrichedPayload = {
      ...payload,
      event: eventName,
      timestamp: new Date().toISOString(),
    };

    // 1. In-process listeners
    const handlers = listeners.get(eventName);
    if (handlers) {
      for (const fn of handlers) {
        try { fn(enrichedPayload); } catch (e) {
          console.error(`[CRM Events] Listener error for ${eventName}:`, e.message);
        }
      }
    }

    // 2. Windmill dispatch (async, non-blocking)
    this._dispatchToWindmill(eventName, enrichedPayload).catch(err => {
      console.error(`[CRM Events] Windmill dispatch error for ${eventName}:`, err.message);
    });
  },

  /** Register an in-process listener. */
  on(eventName, handler) {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(handler);
  },

  /** Remove an in-process listener. */
  off(eventName, handler) {
    listeners.get(eventName)?.delete(handler);
  },

  /** Return the full event catalogue for UI dropdowns. */
  listEvents() {
    return EVENT_CATALOGUE;
  },

  // -----------------------------------------------------------------------
  // Internal: query triggers table and run matching Windmill flows
  // -----------------------------------------------------------------------
  async _dispatchToWindmill(eventName, payload) {
    if (!_pool) return;

    // Find active triggers for this event that belong to active automations
    const { rows: triggers } = await _pool.query(`
      SELECT t.id, t.conditions, t.automation_id,
             a.name AS automation_name, a.windmill_flow_path, a.trigger_type
      FROM automation_triggers t
      JOIN automations a ON a.id = t.automation_id
      WHERE t.event_name = $1
        AND t.is_active = true
        AND a.is_active = true
        AND a.windmill_flow_path IS NOT NULL
    `, [eventName]);

    if (triggers.length === 0) return;

    for (const trigger of triggers) {
      // Check optional conditions
      if (!matchesConditions(trigger.conditions, payload)) continue;

      // Insert run record
      let runId;
      try {
        const { rows } = await _pool.query(`
          INSERT INTO automation_runs (automation_id, trigger_type, trigger_data, status, started_at)
          VALUES ($1, 'event', $2, 'running', NOW())
          RETURNING id
        `, [trigger.automation_id, JSON.stringify(payload)]);
        runId = rows[0].id;
      } catch (e) {
        console.error(`[CRM Events] Failed to log run for automation ${trigger.automation_id}:`, e.message);
        continue;
      }

      // Fire Windmill flow (non-blocking per-flow)
      this._executeFlow(trigger, payload, runId).catch(err => {
        console.error(`[CRM Events] Flow execution error (${trigger.windmill_flow_path}):`, err.message);
      });
    }
  },

  async _executeFlow(trigger, payload, runId) {
    const startMs = Date.now();
    try {
      console.log(`[CRM Events] Running flow ${trigger.windmill_flow_path} for "${trigger.automation_name}"`);

      const jobId = await WindmillService.runFlow(trigger.windmill_flow_path, payload);

      // Update run record with job id
      await _pool.query(`
        UPDATE automation_runs
        SET windmill_job_id = $1
        WHERE id = $2
      `, [typeof jobId === 'string' ? jobId : JSON.stringify(jobId), runId]);

      // Poll for completion in background (simple: wait up to 60s)
      this._pollJobResult(runId, jobId, startMs).catch(() => {});

    } catch (err) {
      const durationMs = Date.now() - startMs;
      await _pool.query(`
        UPDATE automation_runs
        SET status = 'failed', error = $1, duration_ms = $2, completed_at = NOW()
        WHERE id = $3
      `, [err.message, durationMs, runId]).catch(() => {});
    }
  },

  async _pollJobResult(runId, jobId, startMs) {
    // Wait a bit then check result
    const id = typeof jobId === 'string' ? jobId : jobId?.id || jobId;
    if (!id) return;

    // Simple polling: check after 5s, then 15s, then 30s
    for (const delay of [5000, 10000, 15000]) {
      await new Promise(r => setTimeout(r, delay));
      try {
        const job = await WindmillService.getJob(id);
        if (job && (job.type === 'CompletedJob' || job.success !== undefined)) {
          const durationMs = Date.now() - startMs;
          const status = job.success === false ? 'failed' : 'completed';
          await _pool.query(`
            UPDATE automation_runs
            SET status = $1, result = $2, duration_ms = $3, completed_at = NOW()
            WHERE id = $4
          `, [status, JSON.stringify(job.result || {}), durationMs, runId]);
          return;
        }
      } catch { /* keep polling */ }
    }

    // If still running after 30s, mark as completed (result will be fetched on-demand)
    const durationMs = Date.now() - startMs;
    await _pool.query(`
      UPDATE automation_runs
      SET status = 'completed', duration_ms = $1, completed_at = NOW()
      WHERE id = $2 AND status = 'running'
    `, [durationMs, runId]).catch(() => {});
  },
};

export default crmEvents;
