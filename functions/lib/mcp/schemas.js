// COH-016 — strict input schemas for the MCP tools (zod).
//
// Every schema is `.strict()`: an unknown key is an ERROR, not silently dropped.
// What is deliberately absent is the security property — assignees,
// assigneeUids, sharedWith, sharedWithUids, visibility, createdBy*, taskNumber,
// createdAt, archived*, type, photos, links and recurrence markers can never be
// supplied by the model, so ChatGPT cannot reassign, re-share or forge a task.
//
// The enumerations below mirror the board (src/components/board/boardUI.jsx:
// STATUSES, PRIORITIES; src/utils/date.js: RECURRENCE_FREQS). The parity test
// functions/test/mcp-schema.test.mjs fails if they drift.

const { z } = require('zod');

const STATUSES = ['Backlog', 'Planning', 'In Progress', 'On Hold', 'Complete', 'Cancelled'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const RECURRENCE_VALUES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually'];

// A bare task id: the Firestore auto-id charset, no prefix, no slash. `task_x`
// and `mnt_x` both fail on the underscore, which also blocks maintenance ids.
const bareId = z.string().regex(/^[A-Za-z0-9]{1,64}$/, 'id must be the bare task id');

const status = z.enum(STATUSES);
const priority = z.enum(PRIORITIES);
const dueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD').or(z.literal(''));
const recurrence = z.enum(RECURRENCE_VALUES).or(z.literal(''));
const name = z.string().trim().min(1).max(200);
const longText = z.string().max(10000);
const tag = z.string().trim().min(1).max(50);
const tags = z.array(tag).max(30);

// Exactly the item the board writes: { id, text, done } (WorkBoard.jsx:2650).
const checklistItem = z.object({
  id: z.string().min(1).max(64).optional(),
  text: z.string().trim().min(1).max(500),
  done: z.boolean(),
}).strict();
const checklist = z.array(checklistItem).max(100);

const listTasksSchema = z.object({
  status: status.optional(),
  assignedToMe: z.boolean().optional(),
  dueBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeComplete: z.boolean().optional(),
}).strict();

const getTaskSchema = z.object({ id: bareId }).strict();

const createTaskSchema = z.object({
  name,
  description: longText.optional(),
  priority: priority.optional(),
  status: status.optional(),
  dueDate: dueDate.optional(),
  recurrence: recurrence.optional(),
  notes: longText.optional(),
  tags: tags.optional(),
  checklist: checklist.optional(),
}).strict();

const updateTaskSchema = z.object({
  id: bareId,
  name: name.optional(),
  description: longText.optional(),
  notes: longText.optional(),
  priority: priority.optional(),
  status: status.optional(),
  dueDate: dueDate.optional(),
  recurrence: recurrence.optional(),
  tags: tags.optional(),
  checklist: checklist.optional(),
}).strict();

const addCommentSchema = z.object({
  id: bareId,
  text: z.string().trim().min(1).max(5000),
}).strict();

module.exports = {
  STATUSES, PRIORITIES, RECURRENCE_VALUES,
  listTasksSchema, getTaskSchema, createTaskSchema, updateTaskSchema, addCommentSchema,
};
