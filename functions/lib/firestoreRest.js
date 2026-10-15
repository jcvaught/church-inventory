// COH-016 — a small Firestore REST client + value codec.
//
// Why this exists: the Admin SDK skips firestore.rules. The ChatGPT MCP server
// (functions/lib/mcp/) must read and write task data AS THE KEY'S OWNER so the
// rules (membership, deactivation, COH-006 visibility, immutable fields, COH-007
// archive state) apply exactly as they do for the browser. The REST API with an
// ID token minted for that user is the only server-side path that does that.
// NEVER use the Admin SDK for task / comment / config/main / activityLog data in
// this feature.
//
// Pure and dependency-free (global fetch resolved at CALL time so tests can stub
// it). Errors are mapped to a RestError whose `kind` is safe to show a caller;
// the raw response body is kept in `detail` for Sentry only and must never be
// echoed to the client.

const DEFAULT_PROJECT = 'church-inventory-9615c';

// ── value codec ──────────────────────────────────────────────────────────────

/** Encode one JS value as a Firestore REST `Value`. */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('firestoreRest: cannot encode a non-finite number');
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) {
    return v.length ? { arrayValue: { values: v.map(toValue) } } : { arrayValue: {} };
  }
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  throw new Error(`firestoreRest: cannot encode a value of type ${typeof v}`);
}

/** Encode a plain object as a REST `fields` map. `undefined` members are skipped. */
function encodeFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined) continue;
    fields[k] = toValue(v);
  }
  return fields;
}

/** Decode a REST `Value`. Timestamps become Date; integers become Number. */
function fromValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return new Date(val.timestampValue);
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromValue);
  if ('mapValue' in val) return decodeFields(val.mapValue.fields || {});
  if ('referenceValue' in val) return val.referenceValue;
  if ('bytesValue' in val) return val.bytesValue;
  if ('geoPointValue' in val) return val.geoPointValue;
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromValue(v);
  return out;
}

/** Decode a REST Document into `{ id, path, createTime, updateTime, data }`. */
function decodeDoc(d) {
  if (!d || !d.name) return null;
  const path = d.name.split('/documents/')[1] || '';
  return {
    id: path.split('/').pop(),
    path,
    createTime: d.createTime || null,
    updateTime: d.updateTime || null,
    data: decodeFields(d.fields || {}),
  };
}

// ── names, masks, writes ─────────────────────────────────────────────────────

function docName(path, projectId = DEFAULT_PROJECT) {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

const SIMPLE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A field path segment, backtick-quoted when it is not a simple identifier. */
function fieldPathSegment(seg) {
  return SIMPLE_FIELD.test(seg) ? seg : '`' + seg.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`';
}

/**
 * `updateMask` for exactly the top-level keys in `fieldNames`. A key listed in
 * the mask but absent from the written fields is DELETED by Firestore, which is
 * how a field is removed (see rollback of nextRecurrenceCreatedAt).
 */
function buildUpdateMask(fieldNames) {
  return { fieldPaths: [...fieldNames].map(fieldPathSegment) };
}

/** `updateTransforms` entry that stamps `fieldPath` with request.time. */
function requestTimeTransform(fieldPath) {
  return { fieldPath: fieldPathSegment(fieldPath), setToServerValue: 'REQUEST_TIME' };
}

/**
 * A commit `Write` that updates only `fieldNames` (a mask) of an existing or
 * to-be-created doc. `data` supplies the values; names in the mask but absent
 * from `data` are deleted.
 *
 * opts: { exists: true|false (precondition), updateTime: ISO precondition,
 *         transforms: [requestTimeTransform(..)], projectId }
 */
function updateWrite(path, data, fieldNames, opts = {}) {
  const w = {
    update: { name: docName(path, opts.projectId), fields: encodeFields(data) },
    updateMask: buildUpdateMask(fieldNames),
  };
  if (opts.transforms && opts.transforms.length) w.updateTransforms = opts.transforms;
  if (opts.updateTime) w.currentDocument = { updateTime: opts.updateTime };
  else if (typeof opts.exists === 'boolean') w.currentDocument = { exists: opts.exists };
  return w;
}

/**
 * A commit `Write` that CREATES a doc (fails if it already exists). With a
 * server-time transform the doc is created in full; no updateMask is sent
 * because every key is being written.
 */
function createWrite(path, data, opts = {}) {
  const w = {
    update: { name: docName(path, opts.projectId), fields: encodeFields(data) },
    currentDocument: { exists: false },
  };
  if (opts.transforms && opts.transforms.length) w.updateTransforms = opts.transforms;
  return w;
}

// ── structured queries ───────────────────────────────────────────────────────

const OPS = { '==': 'EQUAL', 'array-contains': 'ARRAY_CONTAINS' };

/**
 * StructuredQuery for `collectionId` with AND-ed `[field, op, value]` filters.
 * Only the operators the task arms need are supported.
 */
function buildQuery(collectionId, filters = [], { limit, orderBy } = {}) {
  const q = { from: [{ collectionId }] };
  const fieldFilters = filters.map(([field, op, value]) => {
    if (!OPS[op]) throw new Error(`firestoreRest: unsupported operator ${op}`);
    return { fieldFilter: { field: { fieldPath: fieldPathSegment(field) }, op: OPS[op], value: toValue(value) } };
  });
  if (fieldFilters.length === 1) q.where = fieldFilters[0];
  else if (fieldFilters.length > 1) q.where = { compositeFilter: { op: 'AND', filters: fieldFilters } };
  if (orderBy) q.orderBy = [{ field: { fieldPath: fieldPathSegment(orderBy[0]) }, direction: orderBy[1] === 'desc' ? 'DESCENDING' : 'ASCENDING' }];
  if (limit) q.limit = limit;
  return q;
}

// ── errors ───────────────────────────────────────────────────────────────────

class RestError extends Error {
  constructor(kind, status, detail) {
    super(`Firestore REST ${kind} (${status})`);
    this.name = 'RestError';
    this.kind = kind;     // 'permission' | 'not_found' | 'conflict' | 'unavailable' | 'error'
    this.status = status;
    // Raw body: Sentry only. Never echo to a caller.
    Object.defineProperty(this, 'detail', { value: detail, enumerable: false });
  }
}

function classify(status, bodyText) {
  let code = '';
  try { code = JSON.parse(bodyText)?.error?.status || ''; } catch { /* not JSON */ }
  if (status === 403 || code === 'PERMISSION_DENIED') return 'permission';
  if (status === 404 || code === 'NOT_FOUND') return 'not_found';
  if (status === 409 || code === 'ABORTED' || code === 'ALREADY_EXISTS' || code === 'FAILED_PRECONDITION') return 'conflict';
  if (status === 429 || status === 503 || code === 'UNAVAILABLE') return 'unavailable';
  return 'error';
}

// ── client ───────────────────────────────────────────────────────────────────

/**
 * A REST client bound to one project. Every method takes the caller's ID token
 * first, so no token is ever held here.
 */
function createFirestoreRest({ projectId = DEFAULT_PROJECT, fetchFn } = {}) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const rootName = `projects/${projectId}/databases/(default)`;
  const doFetch = (...a) => (fetchFn || globalThis.fetch)(...a);

  async function call(token, method, url, body) {
    const res = await doFetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new RestError(classify(res.status, text), res.status, text);
    }
    return res.json();
  }

  return {
    projectId,
    docName: (path) => docName(path, projectId),

    /** Decoded doc, or null when it does not exist (404). */
    async getDoc(token, path, { transaction } = {}) {
      const qs = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
      try {
        return decodeDoc(await call(token, 'GET', `${base}/${path}${qs}`));
      } catch (e) {
        if (e instanceof RestError && e.kind === 'not_found') return null;
        throw e;
      }
    },

    /** Run a structured query under `parentPath` ('' = database root). Decoded docs. */
    async runQuery(token, parentPath, structuredQuery, { transaction } = {}) {
      const body = { structuredQuery };
      if (transaction) body.transaction = transaction;
      const url = `${base}${parentPath ? '/' + parentPath : ''}:runQuery`;
      const rows = await call(token, 'POST', url, body);
      return (Array.isArray(rows) ? rows : []).filter((r) => r.document).map((r) => decodeDoc(r.document));
    },

    async beginTransaction(token) {
      const r = await call(token, 'POST', `${base}:beginTransaction`, { options: { readWrite: {} } });
      return r.transaction;
    },

    /** Commit `writes` (optionally within `transaction`). */
    async commit(token, writes, transaction) {
      const body = { writes };
      if (transaction) body.transaction = transaction;
      return call(token, 'POST', `${base}:commit`, body);
    },

    /** Create a doc in `collectionPath` with a server-assigned id. Returns the decoded doc. */
    async createDocument(token, collectionPath, data) {
      return decodeDoc(await call(token, 'POST', `${base}/${collectionPath}`, { fields: encodeFields(data) }));
    },

    rootName,
  };
}

module.exports = {
  DEFAULT_PROJECT,
  toValue, fromValue, encodeFields, decodeFields, decodeDoc,
  docName, fieldPathSegment, buildUpdateMask, requestTimeTransform,
  updateWrite, createWrite, buildQuery,
  RestError, classify, createFirestoreRest,
};
