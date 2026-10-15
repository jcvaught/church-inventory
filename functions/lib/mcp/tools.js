// COH-016 — the MCP tools. Each one runs AS THE KEY'S OWNER through the
// Firestore REST API (functions/lib/firestoreRest.js) with that user's ID
// token, so firestore.rules authorize every read and write exactly as they do
// for the browser. NOTHING here touches the Admin SDK.
//
// Each tool mirrors a client code path; the line references are the source of
// truth if this file and the client ever disagree:
//   create_task  <- addTask             src/useFirestore.js:881
//   update_task  <- updateTask          src/useFirestore.js:928
//                   status/completedAt  src/pages/hubs/WorkBoard.jsx:1325
//   recurrence   <- createNextRecurringTask  WorkBoard.jsx:974
//   add_comment  <- addTaskComment      src/useFirestore.js:1043
//   list_tasks   <- taskQueryArms       src/utils/workQueries.js:36
//   activity log <- logActivity         src/useFirestore.js:740
//
// Tools receive already-validated input (lib/mcp/schemas.js) and return plain
// objects; they throw ToolError for caller-facing refusals. server.js maps
// errors; the raw Firestore error body is never returned.

const crypto = require('crypto');
const {
  RestError, updateWrite, createWrite, buildQuery, requestTimeTransform,
} = require('../firestoreRest');

class ToolError extends Error {}

// ── small shared helpers ─────────────────────────────────────────────────────

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** A Firestore-style 20-char auto id (rejection sampling: 248 = 62 * 4). */
function autoId() {
  let out = '';
  while (out.length < 20) {
    for (const b of crypto.randomBytes(40)) {
      if (b < 248 && out.length < 20) out += ALNUM[b % 62];
    }
  }
  return out;
}

// src/utils/taskVisibility.js:uidsOf
function uidsOf(people) {
  if (!Array.isArray(people)) return [];
  return [...new Set(people.map((p) => p && p.uid).filter(Boolean))].sort();
}

const VISIBILITIES = ['team', 'private', 'shared'];
const taskPath = (churchId, bare) => `churches/${churchId}/workItems/task_${bare}`;
const bareOf = (docId) => (docId.startsWith('task_') ? docId.slice(5) : docId);
const nameIsLoggable = (visibility) => visibility !== 'private' && visibility !== 'shared';

/**
 * The four authorization-shaped arms of the board (src/utils/workQueries.js
 * taskQueryArms with archived:false, max ARM_LIMIT). Same `[field, op, value]`
 * triples; functions/test/mcp-tools.test.mjs pins this against the client copy.
 */
// ARM_LIMIT: completed tasks archive after six weeks (COH-007), so active arms
// stay far below this; if any arm hits it the result says truncated.
const ARM_LIMIT = 1000;
function taskQueryArms({ uid, max = ARM_LIMIT }) {
  const arm = (key, filters) => ({ key, filters: [...filters, ['archived', '==', false]], limit: max });
  return [
    arm('team', [['visibility', '==', 'team']]),
    arm('own', [['createdBy', '==', uid]]),
    arm('assigned', [['assigneeUids', 'array-contains', uid]]),
    arm('shared', [['visibility', '==', 'shared'], ['sharedWithUids', 'array-contains', uid]]),
  ];
}

// ── the tool set ─────────────────────────────────────────────────────────────

/**
 * ctx: { rest, token, uid, churchId, profile, canCreate, now():Date,
 *        calculateNextDue(dueDate, recurrence), captureError(err, tags) }
 */
function createTools(ctx) {
  const { rest, token, uid, churchId, profile } = ctx;
  const nowIso = () => ctx.now().toISOString();

  // The audit trail. A failed write is captured and swallowed: the action
  // already committed (matches logActivity, useFirestore.js:748). The rule pins
  // performedBy, performedByName and timestamp == request.time (rules:404-411),
  // hence the REQUEST_TIME transform.
  async function logActivity(action, itemId, details) {
    try {
      await rest.commit(token, [createWrite(
        `churches/${churchId}/activityLog/${autoId()}`,
        { action, itemId, performedBy: uid, performedByName: profile.name, details: { ...details, via: 'chatgpt' } },
        { transforms: [requestTimeTransform('timestamp')] },
      )]);
    } catch (err) {
      ctx.captureError(err, { op: 'logActivity', action });
    }
  }

  async function fetchTask(bare) {
    const d = await rest.getDoc(token, taskPath(churchId, bare));
    // Rules decide visibility; a type check on top keeps maintenance tickets (and
    // a forged type:'task' at a non-task_ id) out of reach.
    if (!d || d.data.type !== 'task' || !d.id.startsWith('task_')) throw new ToolError('Task not found.');
    return d;
  }

  // The addTask transaction (useFirestore.js:881-924) over REST: read
  // config/main -> maxTaskNumber+1 -> TSK-### -> commit the counter bump and the
  // new doc together. `fields` carries the caller-supplied half; everything the
  // server owns (type, number, creator, uid projections, timestamps, archive
  // pair) is set here.
  //
  // `claimPath` (recurrence only): the completed source task. Its
  // `nextRecurrenceCreatedAt` marker is checked and set INSIDE the same
  // transaction as the counter bump and the successor create, so the three
  // commit atomically or not at all. Returns null when the marker is already
  // set (someone else made the successor). Codex diff review 2026-10-15: a
  // separate marker write + rollback could duplicate the successor when a
  // create's reply was lost after it committed; this has no rollback to get wrong.
  async function createTaskDoc(fields, { claimPath } = {}) {
    const newId = autoId();
    const configPath = `churches/${churchId}/config/main`;
    const path = taskPath(churchId, newId);
    for (let attempt = 0; ; attempt++) {
      const tx = await rest.beginTransaction(token);
      const cfg = await rest.getDoc(token, configPath, { transaction: tx });
      let claimWrite = null;
      if (claimPath) {
        const src = await rest.getDoc(token, claimPath, { transaction: tx });
        if (!src || src.data.nextRecurrenceCreatedAt) return null;
        claimWrite = updateWrite(
          claimPath, { nextRecurrenceCreatedAt: nowIso() }, ['nextRecurrenceCreatedAt'], { updateTime: src.updateTime },
        );
      }
      const maxNum = ((cfg && cfg.data.maxTaskNumber) || 0) + 1;
      const taskNumber = 'TSK-' + String(maxNum).padStart(3, '0');
      const stamp = nowIso();
      const data = {
        ...fields,
        type: 'task',
        taskNumber,
        createdBy: uid,
        createdByName: profile.name,
        status: fields.status || 'Backlog',
        visibility: fields.visibility || 'team',
        sharedWith: fields.sharedWith || [],
        sharedWithUids: uidsOf(fields.sharedWith),
        assigneeUids: uidsOf(fields.assignees),
        createdAt: stamp,
        updatedAt: stamp,
        completedAt: null,
        archived: false,
        archivedAt: null,
      };
      try {
        await rest.commit(token, [
          ...(claimWrite ? [claimWrite] : []),
          updateWrite(configPath, { maxTaskNumber: maxNum }, ['maxTaskNumber']),
          createWrite(path, data),
        ], tx);
        const details = { priority: data.priority };
        if (nameIsLoggable(data.visibility)) details.name = data.name;
        await logActivity('add_task', taskNumber, details);
        return { id: newId, taskNumber, data };
      } catch (err) {
        // Two creators raced for the same number (or two Completes for the same
        // marker): re-read and try again. The marker loser then returns null.
        if (err instanceof RestError && err.kind === 'conflict' && attempt < 2) continue;
        throw err;
      }
    }
  }

  const normChecklist = (items, base) =>
    (items || []).map((c, i) => ({ id: c.id || String(base + i), text: c.text, done: c.done }));

  // createNextRecurringTask (WorkBoard.jsx:974-1016) over REST: build the
  // successor exactly as the board does (task branch, 984-1009), then create it
  // in ONE transaction with the source's marker (createTaskDoc claimPath).
  // Two concurrent Completes produce exactly one successor.
  async function createNextRecurring(source, sourcePath) {
    const nextDue = ctx.calculateNextDue(source.dueDate, source.recurrence);
    const vis = source.visibility || 'team';
    const fields = {
      name: source.name,
      description: source.description,
      priority: source.priority,
      tags: source.tags || [],
      dueDate: nextDue,
      recurrence: source.recurrence,
      assignees: source.assignees || [],
      checklist: (source.checklist || []).map((c) => ({ ...c, done: false })),
      notes: source.notes || null,
      photos: [],
      completedAt: null,
      visibility: vis,
      sharedWith: vis === 'shared' ? (source.sharedWith || []) : [],
    };
    return createTaskDoc(fields, { claimPath: sourcePath });
  }

  return {
    // ── list_tasks ──────────────────────────────────────────────────────────
    async list_tasks(input) {
      const arms = taskQueryArms({ uid });
      let results;
      try {
        results = await Promise.all(arms.map((a) =>
          rest.runQuery(token, `churches/${churchId}`, buildQuery('workItems', a.filters, { limit: a.limit }))));
      } catch (err) {
        // FAILED_PRECONDITION on a query is a missing composite index. Report it;
        // never fall back to the Admin SDK (that would skip the rules).
        if (err instanceof RestError && err.kind === 'conflict') {
          ctx.captureError(err, { op: 'list_tasks', reason: 'missing-index' });
          throw new ToolError('The task query needs a database index that is not available. This has been reported.');
        }
        throw err;
      }
      const capped = results.some((r) => r.length >= ARM_LIMIT);
      const merged = new Map();
      for (const r of results) for (const d of r) merged.set(d.id, d);
      let tasks = [...merged.values()].filter((d) => d.data.type === 'task' && d.id.startsWith('task_'));

      const explicit = input.status;
      tasks = tasks.filter((d) => {
        const t = d.data;
        if (explicit) { if (t.status !== explicit) return false; }
        else if (!input.includeComplete && (t.status === 'Complete' || t.status === 'Cancelled')) return false;
        if (input.assignedToMe && !(Array.isArray(t.assigneeUids) && t.assigneeUids.includes(uid))) return false;
        if (input.dueBefore && !(t.dueDate && t.dueDate < input.dueBefore)) return false;
        return true;
      });
      tasks.sort((a, b) => (b.data.createdAt || '').localeCompare(a.data.createdAt || ''));
      const page = tasks.slice(0, 100);
      return {
        truncated: tasks.length > 100 || capped,
        count: page.length,
        tasks: page.map((d) => ({
          id: bareOf(d.id),
          taskNumber: d.data.taskNumber,
          name: d.data.name,
          status: d.data.status,
          priority: d.data.priority,
          dueDate: d.data.dueDate || null,
          assignees: (d.data.assignees || []).map((a) => a.name),
          visibility: d.data.visibility,
          tags: d.data.tags || [],
          snippet: (d.data.description || '').slice(0, 140),
        })),
      };
    },

    // ── get_task ────────────────────────────────────────────────────────────
    async get_task({ id }) {
      const d = await fetchTask(id);
      const t = d.data;
      const comments = await rest.runQuery(
        token, taskPath(churchId, id),
        buildQuery('comments', [], { orderBy: ['createdAt', 'asc'], limit: 200 }),
      );
      return {
        id,
        taskNumber: t.taskNumber,
        name: t.name,
        description: t.description || '',
        notes: t.notes || '',
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate || null,
        recurrence: t.recurrence || null,
        tags: t.tags || [],
        checklist: t.checklist || [],
        assignees: (t.assignees || []).map((a) => a.name),
        visibility: t.visibility,
        createdByName: t.createdByName,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        completedAt: t.completedAt || null,
        photoCount: Array.isArray(t.photos) ? t.photos.length : 0, // photo data is never returned
        comments: comments.map((c) => ({
          author: c.data.authorName,
          text: c.data.text,
          createdAt: c.data.createdAt,
        })),
      };
    },

    // ── create_task ─────────────────────────────────────────────────────────
    async create_task(input) {
      // Lapsed churches cannot start anything new (createBlocked, useFirestore.js:126).
      if (!ctx.canCreate) throw new ToolError('This church’s 90 days are up — a new task can’t be added until it subscribes.');
      // The app's own new-task default (WorkBoard.jsx:713) — not reassignment.
      const visibility = VISIBILITIES.includes(profile.taskDefaultVisibility) ? profile.taskDefaultVisibility : 'private';
      const sharedWith = visibility === 'shared'
        ? (Array.isArray(profile.taskDefaultSharedWith) ? profile.taskDefaultSharedWith : [])
          .filter((p) => p && p.uid).map((p) => ({ uid: p.uid, name: p.name }))
        : [];
      const fields = {
        name: input.name.trim(),
        description: (input.description || '').trim(),
        priority: input.priority || 'Medium',
        status: input.status || 'Backlog',
        tags: input.tags || [],
        dueDate: input.dueDate || null,
        recurrence: input.recurrence || null,
        assignees: [{ uid, name: profile.name }], // new tasks start assigned to their creator
        checklist: normChecklist(input.checklist, ctx.now().getTime()),
        photos: [],
        notes: input.notes ? input.notes : null,
        completedAt: null,
        visibility,
        sharedWith,
        // Remaining getEmptyTask defaults (WorkBoard.jsx:586) that apply to tasks.
        linkedItemDocId: null,
        linkedTicketDocId: null,
        estimatedHours: null,
        actualHours: null,
        ministry: '',
      };
      const made = await createTaskDoc(fields);
      return { id: made.id, taskNumber: made.taskNumber, name: fields.name, status: made.data.status };
    },

    // ── update_task ─────────────────────────────────────────────────────────
    async update_task(input) {
      const { id } = input;
      const cur = await fetchTask(id);
      const t = cur.data;
      const path = taskPath(churchId, id);

      const upd = {};
      if (input.name !== undefined) upd.name = input.name.trim();
      if (input.description !== undefined) upd.description = input.description.trim();
      if (input.notes !== undefined) upd.notes = input.notes ? input.notes : null;
      if (input.priority !== undefined) upd.priority = input.priority;
      if (input.dueDate !== undefined) upd.dueDate = input.dueDate || null;
      if (input.recurrence !== undefined) upd.recurrence = input.recurrence || null;
      if (input.tags !== undefined) upd.tags = input.tags;
      if (input.checklist !== undefined) upd.checklist = normChecklist(input.checklist, ctx.now().getTime());

      const wasComplete = t.status === 'Complete';
      let newlyComplete = false;
      if (input.status !== undefined && input.status !== t.status) {
        upd.status = input.status;
        const isNowComplete = input.status === 'Complete';
        newlyComplete = isNowComplete && !wasComplete;
        // WorkBoard.jsx:1325 — newly Complete -> now; otherwise null on change.
        upd.completedAt = newlyComplete ? nowIso() : null;
      }
      if (Object.keys(upd).length === 0) throw new ToolError('Nothing to update: no changed fields were provided.');
      upd.updatedAt = nowIso();

      try {
        await rest.commit(token, [updateWrite(path, upd, Object.keys(upd), { updateTime: cur.updateTime })]);
      } catch (err) {
        if (err instanceof RestError && err.kind === 'conflict') {
          throw new ToolError('The task was changed by someone else while updating. Fetch it again and retry.');
        }
        throw err;
      }

      const statusForLog = input.status;
      const details = {};
      if (statusForLog) details.status = statusForLog;
      if (input.name !== undefined && nameIsLoggable(t.visibility)) details.name = input.name.trim();
      await logActivity(statusForLog === 'Complete' ? 'complete_task' : 'update_task', t.taskNumber || cur.id, details);

      const out = { id, taskNumber: t.taskNumber, updated: Object.keys(upd).filter((k) => k !== 'updatedAt') };
      const effectiveRecurrence = 'recurrence' in upd ? upd.recurrence : t.recurrence;
      if (newlyComplete && effectiveRecurrence) {
        if (!ctx.canCreate) {
          out.nextRecurringTask = 'not created: this church’s 90 days are up';
        } else {
          const made = await createNextRecurring({ ...t, ...upd }, path);
          out.nextRecurringTask = made ? { id: made.id, taskNumber: made.taskNumber, dueDate: made.data.dueDate } : 'already created';
        }
      }
      return out;
    },

    // ── add_comment ─────────────────────────────────────────────────────────
    async add_comment({ id, text }) {
      await fetchTask(id); // type check + visibility (the rules also gate the comment)
      const c = await rest.createDocument(token, `${taskPath(churchId, id)}/comments`, {
        text,
        authorId: uid,
        authorName: profile.name,
        createdAt: nowIso(),
      });
      return { id, commentId: c ? c.id : null };
    },
  };
}

module.exports = { createTools, taskQueryArms, ToolError, autoId, uidsOf };
