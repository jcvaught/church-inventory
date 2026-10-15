// COH-016 — the MCP tool input schemas are strict and cannot express reassignment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECURRENCE_FREQS } from '../../src/utils/date.js';

const require = Module.createRequire(import.meta.url);
const s = require('../lib/mcp/schemas.js');
const here = dirname(fileURLToPath(import.meta.url));

const ok = (schema, v) => assert.equal(schema.safeParse(v).success, true, JSON.stringify(v));
const bad = (schema, v) => assert.equal(schema.safeParse(v).success, false, JSON.stringify(v));

test('create_task accepts a minimal and a full valid input', () => {
  ok(s.createTaskSchema, { name: 'Fix the sound board' });
  ok(s.createTaskSchema, {
    name: 'x', description: 'd', priority: 'High', status: 'Planning', dueDate: '2026-11-01',
    recurrence: 'weekly', notes: 'n', tags: ['a'], checklist: [{ text: 'step', done: false }, { id: '1', text: 's2', done: true }],
  });
  ok(s.createTaskSchema, { name: 'x', dueDate: '', recurrence: '' });
});

test('rejects a bad status, priority, date and recurrence', () => {
  bad(s.createTaskSchema, { name: 'x', status: 'Done' });
  bad(s.updateTaskSchema, { id: 'abc', status: 'complete' });
  bad(s.createTaskSchema, { name: 'x', priority: 'Urgent' });
  bad(s.createTaskSchema, { name: 'x', dueDate: '11/01/2026' });
  bad(s.createTaskSchema, { name: 'x', recurrence: 'daily' });
});

test('rejects any extra key, and every assignee / visibility / identity field', () => {
  bad(s.createTaskSchema, { name: 'x', surprise: 1 });
  for (const k of ['assignees', 'assigneeUids', 'sharedWith', 'sharedWithUids', 'visibility', 'createdBy', 'createdByName',
    'taskNumber', 'createdAt', 'archived', 'archivedAt', 'type', 'photos', 'nextRecurrenceCreatedAt', 'linkedItemDocId']) {
    bad(s.createTaskSchema, { name: 'x', [k]: k === 'visibility' ? 'team' : [] });
    bad(s.updateTaskSchema, { id: 'abc', [k]: k === 'visibility' ? 'team' : [] });
  }
  bad(s.listTasksSchema, { status: 'Backlog', uid: 'someoneElse' });
  bad(s.addCommentSchema, { id: 'abc', text: 'hi', authorId: 'someoneElse' });
});

test('rejects an oversize name, description, notes and comment', () => {
  bad(s.createTaskSchema, { name: 'x'.repeat(201) });
  bad(s.createTaskSchema, { name: '' });
  bad(s.createTaskSchema, { name: '   ' });
  bad(s.createTaskSchema, { name: 'x', description: 'd'.repeat(10001) });
  bad(s.createTaskSchema, { name: 'x', notes: 'n'.repeat(10001) });
  ok(s.createTaskSchema, { name: 'x'.repeat(200), description: 'd'.repeat(10000) });
  bad(s.addCommentSchema, { id: 'abc', text: 'c'.repeat(5001) });
  bad(s.addCommentSchema, { id: 'abc', text: '' });
});

test('rejects a malformed checklist', () => {
  bad(s.createTaskSchema, { name: 'x', checklist: [{ done: true }] });
  bad(s.createTaskSchema, { name: 'x', checklist: [{ text: 'a' }] });
  bad(s.createTaskSchema, { name: 'x', checklist: [{ text: 'a', done: 'yes' }] });
  bad(s.createTaskSchema, { name: 'x', checklist: [{ text: 'a', done: true, extra: 1 }] });
  bad(s.createTaskSchema, { name: 'x', checklist: 'a, b' });
  bad(s.createTaskSchema, { name: 'x', checklist: Array.from({ length: 101 }, () => ({ text: 'a', done: false })) });
});

test('ids must be bare: no task_/mnt_ prefix, no path', () => {
  ok(s.getTaskSchema, { id: 'Ab12Cd34Ef56Gh78Ij90' });
  bad(s.getTaskSchema, { id: 'task_Ab12' });
  bad(s.getTaskSchema, { id: 'mnt_Ab12' });
  bad(s.getTaskSchema, { id: 'a/b' });
  bad(s.getTaskSchema, { id: '' });
  bad(s.updateTaskSchema, { id: '../x' });
});

test('enumerations match the board (drift fails the build)', () => {
  const boardUI = readFileSync(join(here, '../../src/components/board/boardUI.jsx'), 'utf8');
  const list = (name) => {
    const m = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(boardUI);
    assert.ok(m, `${name} not found in boardUI.jsx`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };
  assert.deepEqual(s.STATUSES, list('STATUSES'));
  assert.deepEqual(s.PRIORITIES, list('PRIORITIES'));
  assert.deepEqual(s.RECURRENCE_VALUES, RECURRENCE_FREQS.map(([v]) => v));
});
