// COH-016 — the MCP server and its HTTP front door.
//
// `createMcpHandler(deps)` returns the (req, res) function mounted by
// `exports.mcp` in functions/index.js. Shared infrastructure (Sentry capture,
// subHasHub, the Admin Firestore/Auth handles) is injected so this module never
// requires index.js (no circular import).
//
// Order of operations, each step failing closed BEFORE the next:
//   method -> body size -> Bearer key -> rate limit -> actor pre-checks
//   -> mint the owner's ID token -> hand the request to the MCP transport.
// Authentication happens before the transport ever sees the request.
//
// Stateless Streamable HTTP: a fresh McpServer + transport per request.
// The MCP SDK and zod are required lazily so the ~46 other functions that share
// index.js do not pay their cold-start cost.

const keys = require('./keys');
const { checkActor } = require('./preflight');
const { createTokenProvider } = require('./actAsUser');
const { createFirestoreRest, RestError } = require('../firestoreRest');
const { createTools, ToolError } = require('./tools');

const MAX_BODY_BYTES = 64 * 1024;

const rpcError = (code, message) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

function bodyBytes(req) {
  if (req.rawBody && typeof req.rawBody.length === 'number') return req.rawBody.length;
  const cl = parseInt(req.headers && req.headers['content-length'], 10);
  return Number.isFinite(cl) ? cl : 0;
}

/** Map a tool failure to a caller-safe MCP result. Never echoes Firestore bodies. */
function toolFailure(err, captureError, tags) {
  let text;
  if (err instanceof ToolError) text = err.message;
  else if (err instanceof RestError && err.kind === 'permission') text = 'Not permitted.';
  else if (err instanceof RestError && err.kind === 'not_found') text = 'Not found.';
  else if (err instanceof RestError && err.kind === 'conflict') text = 'The change conflicted with another update. Please retry.';
  else {
    captureError(err, tags);
    text = 'Something went wrong. Please try again.';
  }
  return { isError: true, content: [{ type: 'text', text }] };
}

function buildServer({ tools, keyId, captureError, log }) {
  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
  const s = require('./schemas');
  const server = new McpServer({ name: 'churchopshub-tasks', version: '1.0.0' });

  const register = (name, description, schema, annotations) => {
    server.registerTool(name, { description, inputSchema: schema, annotations }, async (args) => {
      // Logs carry the key id prefix, tool name and task id only — never content or the key.
      log({ mcp: 'tool', key: keyId, tool: name, task: args && args.id });
      try {
        const result = await tools[name](args || {});
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return toolFailure(err, captureError, { tool: name });
      }
    });
  };

  register('list_tasks',
    'List my tasks (open ones by default). Filters: status, assignedToMe, dueBefore (YYYY-MM-DD, strictly before), includeComplete. Returns up to 100, newest first, plus a truncated flag (if truncated is true, some matching tasks were not considered; narrow the filters).',
    s.listTasksSchema, { readOnlyHint: true });
  register('get_task',
    'Get one task in full (fields and comments) by its id.',
    s.getTaskSchema, { readOnlyHint: true });
  register('create_task',
    'Create a task for me. It is private to me unless my ChurchOpsHub task defaults say otherwise, and is assigned to me.',
    s.createTaskSchema, { readOnlyHint: false, destructiveHint: false });
  register('update_task',
    'Update a task: status, priority, dueDate, name, description, notes, tags, recurrence or checklist. Cannot reassign or change who can see it.',
    s.updateTaskSchema, { readOnlyHint: false, destructiveHint: false });
  register('add_comment',
    'Add a comment to a task, posted as me.',
    s.addCommentSchema, { readOnlyHint: false, destructiveHint: false });
  return server;
}

/**
 * deps: {
 *   db: () => Admin Firestore,
 *   createCustomToken: (uid) => Promise<string>,
 *   captureError: (err, tags) => void,
 *   subHasHub, canCreate, calculateNextDue,
 *   now?: () => Date, log?: (obj) => void, fetchFn?: fetch override (tests)
 * }
 */
function createMcpHandler(deps) {
  const now = deps.now || (() => new Date());
  const log = deps.log || ((o) => console.log(JSON.stringify(o)));
  const rest = createFirestoreRest({ fetchFn: deps.fetchFn });
  const getIdToken = createTokenProvider({ createCustomToken: deps.createCustomToken, fetchFn: deps.fetchFn });

  return async function mcp(req, res) {
    const deny = (status, message, headers) => {
      if (headers) for (const [k, v] of Object.entries(headers)) res.set(k, v);
      return res.status(status).json(rpcError(-32000, message));
    };
    try {
      if (req.method !== 'POST') return deny(405, 'Method not allowed.', { Allow: 'POST' });
      if (bodyBytes(req) > MAX_BODY_BYTES) return deny(413, 'Request too large.');

      const db = deps.db();
      const auth = await keys.authenticateKey({ db, authorization: req.headers && req.headers.authorization, now: now() });
      if (!auth.ok) return deny(401, 'Unauthorized.', { 'WWW-Authenticate': 'Bearer' });

      const rl = await keys.rateLimit({ db, hash: auth.hash, now: now() });
      if (!rl.ok) return deny(429, 'Too many requests.', { 'Retry-After': '60' });

      // The checks the rules do not make (spec §1). Admin reads, pre-checks only.
      const [profileSnap, subSnap] = await Promise.all([
        db.doc(`users/${auth.uid}`).get(),
        db.doc(`churches/${auth.churchId}/config/subscription`).get(),
      ]);
      const pre = checkActor(
        { profile: profileSnap.exists ? profileSnap.data() : null, keyChurchId: auth.churchId, sub: subSnap.exists ? subSnap.data() : null },
        { subHasHub: deps.subHasHub, canCreate: deps.canCreate },
      );
      if (!pre.ok) return deny(pre.status, pre.message);
      const profile = profileSnap.data();

      let token;
      try {
        token = await getIdToken(auth.uid);
      } catch (err) {
        // Includes the Gen-2 signBlob/IAM failure documented in actAsUser.js.
        deps.captureError(err, { op: 'mintToken' });
        return deny(500, 'Something went wrong. Please try again.');
      }

      const tools = createTools({
        rest, token, uid: auth.uid, churchId: auth.churchId, profile,
        canCreate: pre.canCreate, now, calculateNextDue: deps.calculateNextDue,
        captureError: deps.captureError,
      });
      const server = buildServer({ tools, keyId: auth.keyId, captureError: deps.captureError, log });
      const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
      // Stateless (no session id). JSON responses (not SSE): one request, one reply.
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
      await server.connect(transport);
      return await transport.handleRequest(req, res, req.body);
    } catch (err) {
      deps.captureError(err, { op: 'mcpHandler' });
      if (!res.headersSent) return res.status(500).json(rpcError(-32603, 'Internal error.'));
      return undefined;
    }
  };
}

module.exports = { createMcpHandler, buildServer, toolFailure, MAX_BODY_BYTES };
