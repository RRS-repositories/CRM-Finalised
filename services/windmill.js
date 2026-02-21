// ============================================================================
// Windmill API Service — Core integration layer
// All Windmill API communication flows through this module.
// Used by server.js routes; the token is NEVER exposed to the frontend.
// ============================================================================

// Read env vars lazily (at call time) because ES module imports are hoisted
// and run before dotenv.config() in server.js.
function getBaseUrl()  { return process.env.WINDMILL_BASE_URL  || 'https://flowmill.fastactionclaims.com'; }
function getToken()    { return process.env.WINDMILL_TOKEN      || ''; }
function getWorkspace(){ return process.env.WINDMILL_WORKSPACE  || 'admins'; }

const DEFAULT_TIMEOUT  = 30_000;   // 30 s for normal calls
const LONG_TIMEOUT     = 300_000;  // 5 min for run-and-wait calls
const MAX_RETRIES      = 3;
const RETRY_DELAY_MS   = 1_000;    // 1 s base, doubles each retry

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function apiUrl(path) {
  // path should start with /  e.g. /scripts/list
  return `${getBaseUrl()}/api/w/${getWorkspace()}${path}`;
}

function headers() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type':  'application/json',
  };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Core request wrapper with retries, timeout, and logging.
 * @param {string} method   - HTTP method
 * @param {string} path     - API path after /api/w/{workspace}
 * @param {object} [body]   - JSON body (for POST/PUT/DELETE with body)
 * @param {object} [opts]   - { timeout, retries, longRunning }
 */
async function request(method, path, body = undefined, opts = {}) {
  const {
    timeout  = opts.longRunning ? LONG_TIMEOUT : DEFAULT_TIMEOUT,
    retries  = MAX_RETRIES,
  } = opts;

  const url = apiUrl(path);
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOpts = {
        method,
        headers: headers(),
        signal: controller.signal,
      };
      if (body !== undefined) {
        fetchOpts.body = JSON.stringify(body);
      }

      console.log(`[Windmill] ${method} ${path} (attempt ${attempt}/${retries})`);

      const res = await fetch(url, fetchOpts);
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`Windmill API ${res.status}: ${text}`);
        err.status = res.status;
        // Don't retry 4xx (client errors) except 429 (rate-limit)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw err;
        }
        throw err;
      }

      // Some endpoints return 204 No Content
      if (res.status === 204) return null;

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await res.json();
      }
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      if (err.name === 'AbortError') {
        lastError = new Error(`Windmill API timeout after ${timeout}ms: ${method} ${path}`);
      }

      // Don't retry non-retryable errors
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
        break;
      }

      if (attempt < retries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[Windmill] Retry ${attempt}/${retries} in ${delay}ms — ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  console.error(`[Windmill] FAILED ${method} ${path}:`, lastError.message);
  throw lastError;
}

// Convenience wrappers
const get    = (path, opts) => request('GET', path, undefined, opts);
const post   = (path, body, opts) => request('POST', path, body, opts);
const put    = (path, body, opts) => request('PUT', path, body, opts);
const del    = (path, body, opts) => request('DELETE', path, body, opts);

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

const WindmillService = {

  // ======================== CONNECTION ========================

  /** Quick health-check — lists scripts to verify credentials work. */
  async testConnection() {
    try {
      const scripts = await get('/scripts/list?per_page=1');
      return { connected: true, workspace: getWorkspace(), scripts: Array.isArray(scripts) ? scripts.length : 0 };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  },

  // ======================== SCRIPTS ==========================

  async listScripts(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return get(`/scripts/list${qs ? '?' + qs : ''}`);
  },

  async getScript(path) {
    return get(`/scripts/get/p/${path}`);
  },

  async createScript(data) {
    return post('/scripts/create', data);
  },

  /** Fire-and-forget — returns job UUID immediately. */
  async runScript(path, args = {}) {
    return post(`/jobs/run/p/${path}`, args);
  },

  /** Run and block until result (up to 5 min). */
  async runScriptAndWait(path, args = {}) {
    return post(`/jobs/run_wait_result/p/${path}`, args, { longRunning: true });
  },

  // ======================== FLOWS ============================

  async listFlows(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return get(`/flows/list${qs ? '?' + qs : ''}`);
  },

  async getFlow(path) {
    return get(`/flows/get/${path}`);
  },

  async createFlow(data) {
    return post('/flows/create', data);
  },

  async updateFlow(path, data) {
    return post(`/flows/update/${path}`, data);
  },

  async deleteFlow(path) {
    return del(`/flows/delete/${path}`);
  },

  /** Fire-and-forget — returns job UUID. */
  async runFlow(path, args = {}) {
    return post(`/jobs/run/f/${path}`, args);
  },

  /** Run and block until result (up to 5 min). */
  async runFlowAndWait(path, args = {}) {
    return post(`/jobs/run_wait_result/f/${path}`, args, { longRunning: true });
  },

  // ======================== JOBS =============================

  async getJob(jobId) {
    return get(`/jobs_u/get/${jobId}`);
  },

  async listJobs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return get(`/jobs/list${qs ? '?' + qs : ''}`);
  },

  async getJobResult(jobId) {
    return get(`/jobs_u/completed/get_result/${jobId}`);
  },

  async cancelJob(jobId) {
    return post(`/jobs_u/cancel/${jobId}`, {});
  },

  // ======================== SCHEDULES ========================

  async listSchedules(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return get(`/schedules/list${qs ? '?' + qs : ''}`);
  },

  async createSchedule(data) {
    return post('/schedules/create', data);
  },

  async deleteSchedule(path) {
    return del(`/schedules/delete/${path}`);
  },

  async setScheduleEnabled(path, enabled) {
    return post(`/schedules/setenabled/${path}`, { enabled });
  },

  // ======================== RESOURCES ========================

  async listResources(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return get(`/resources/list${qs ? '?' + qs : ''}`);
  },

  async createResource(data) {
    return post('/resources/create', data);
  },

  async getResource(path) {
    return get(`/resources/get/${path}`);
  },

  // ======================== VARIABLES ========================

  async listVariables(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return get(`/variables/list${qs ? '?' + qs : ''}`);
  },

  async createVariable(data) {
    return post('/variables/create', data);
  },

  // ======================== FOLDERS ==========================

  async createFolder(name) {
    return post('/folders/create', { name });
  },

  async listFolders() {
    return get('/folders/list');
  },

  // ======================== WEBHOOKS =========================

  /** Build the public webhook URL for a given flow path. */
  getWebhookUrl(path) {
    return `${getBaseUrl()}/api/w/${getWorkspace()}/jobs/run/f/${path}`;
  },

  // ======================== UTILS ============================

  /** Return config (without the token) for diagnostics. */
  getConfig() {
    return {
      baseUrl:   getBaseUrl(),
      workspace: getWorkspace(),
      hasToken:  !!getToken(),
    };
  },
};

export default WindmillService;
