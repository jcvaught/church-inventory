import { B } from '../components/brand/tokens.js';

export const actionLabels = {
  add_item: 'Item Added', edit_item: 'Item Edited', check_out: 'Checked Out', return: 'Returned',
  dispose: 'Disposed', mark_repair: 'Sent to Repair', mark_repaired: 'Repair Complete',
  add_supply: 'Supply Added', edit_supply: 'Supply Edited', use_supply: 'Supply Used', restock: 'Restocked',
  post_job: 'Job Posted', update_job: 'Job Updated', delete_job: 'Job Deleted',
  signup_job: 'Signed Up for Job', withdraw_job: 'Withdrew from Job', admin_remove_job: 'Removed from Job (Admin)',
  post_announcement: 'Announcement Posted', update_announcement: 'Announcement Updated', delete_announcement: 'Announcement Deleted',
  add_task: 'Task Created', update_task: 'Task Updated', complete_task: 'Task Completed', delete_task: 'Task Deleted',
  create_template: 'Template Created', delete_template: 'Template Deleted',
};

export const actionIcons = {
  add_item: '➕', edit_item: '✏️', check_out: '📤', return: '↩️', dispose: '🗑️',
  mark_repair: '🔧', mark_repaired: '✅', add_supply: '📋', edit_supply: '✏️',
  use_supply: '📉', restock: '📦',
  post_job: '💼', update_job: '✏️', delete_job: '🗑️',
  signup_job: '✅', withdraw_job: '↩️', admin_remove_job: '🚫',
  post_announcement: '📢', update_announcement: '✏️', delete_announcement: '🗑️',
  add_task: '➕', update_task: '✏️', complete_task: '✅', delete_task: '🗑️',
  create_template: '📋', delete_template: '🗑️',
};

export const actionColors = {
  add_item: B.teal, edit_item: B.navy, check_out: '#1A65C7', return: B.teal,
  dispose: B.red, mark_repair: '#96750E', mark_repaired: B.teal,
  add_supply: B.teal, edit_supply: B.navy, use_supply: '#96750E', restock: '#1A65C7',
  post_job: '#16A34A', update_job: B.navy, delete_job: B.red,
  signup_job: B.teal, withdraw_job: '#96750E', admin_remove_job: B.red,
  post_announcement: '#7C3AED', update_announcement: B.navy, delete_announcement: B.red,
  add_task: B.teal, update_task: B.navy, complete_task: B.teal, delete_task: B.red,
  create_template: B.navy, delete_template: B.red,
};
