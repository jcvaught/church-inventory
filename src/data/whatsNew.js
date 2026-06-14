// User-facing "What's New" log. Plain-language, benefit-first, newest-first.
// NOT the technical changelog (that's docs/CHANGELOG.md). When a user-VISIBLE
// change ships, add a short entry here as part of the end-of-session doc ritual.
// tag: 'New' | 'Improved' | 'Fixed'. Keep it about what the user gets, not how.
export const WHATS_NEW = [
  {
    date: '2026-06-14',
    tag: 'New',
    title: 'Morning alert for understaffed jobs',
    body: "Admins can now get a 7am email heads-up if any job scheduled for that day isn't fully staffed yet — whether it has nobody signed up or just a few of the spots filled — so you have time to recruit before the shift. Turn it on under Settings → Church Settings → Daily Job Alerts. It only emails on days that actually need attention.",
  },
  {
    date: '2026-06-12',
    tag: 'Improved',
    title: 'Phone numbers format themselves',
    body: "Phone numbers now format automatically as you type — just enter the digits and they turn into (555) 555-5555. This works wherever you enter a number: People Access contacts, Maintenance Hub vendors, and the public item-request form. Numbers already on file display the same tidy way.",
  },
  {
    date: '2026-06-07',
    tag: 'New',
    title: 'What needs attention this week',
    body: "Admins now get an AI summary right on the Dashboard that reads across everything — overdue tasks and maintenance, expiring background checks and certifications, low stock, unfilled shifts, and contractor schedule and payments — and tells you, in plain language, what to look at this week. It refreshes weekly (tap ↻ to update sooner). Want it in your inbox too? Turn on the new Monday digest in Settings → Church Settings.",
  },
  {
    date: '2026-06-07',
    tag: 'New',
    title: 'Contractor scheduling & payments',
    body: "The Timesheet (People Access → Timesheet) now tracks contractor work end to end: schedule upcoming work, log the actual hours when it's done, approve it, and mark it Paid — with an at-a-glance Awaiting Payment total. You can also schedule a contractor straight from a maintenance ticket (open a ticket → Contractor Work → Schedule Contractor); when you log those hours, the cost rolls into the ticket's Actual Cost automatically.",
  },
  {
    date: '2026-06-07',
    tag: 'New',
    title: 'Weekly email digests',
    body: "Admins can now get a Monday-morning email recap. The Insights digest flags warranty alerts, supplies running low, and your most-used items; the Compliance digest lists background checks, certifications, and key assignments expiring soon. Turn either on under Settings → Church Settings — they only send when there's something worth reporting. (We also fixed Insights charts so they now reflect your full year of activity, not just the last 100 actions.)",
  },
  {
    date: '2026-06-07',
    tag: 'New',
    title: 'Notifications & push alerts',
    body: "Get notified the moment you're assigned a maintenance ticket or task, @mentioned in a comment, your reservation is approved or denied, or you're promoted off a shift waitlist. Open the new 🔔 bell in the header for your inbox, and turn on push (Settings → Notifications) to get alerts on your phone even when the app is closed.",
  },
  {
    date: '2026-06-06',
    tag: 'New',
    title: 'Quick search — press ⌘K (or Ctrl+K)',
    body: 'Instantly find any item, person, task, maintenance ticket, job, supply, or reservation and jump straight to it. Tap 🔍 in the header or press ⌘K / Ctrl+K from anywhere.',
  },
  {
    date: '2026-06-06',
    tag: 'New',
    title: 'Contractor hours & timesheets',
    body: 'Track paid contractor hours: mark someone as a Contractor with an hourly rate in People Access, then log their hours and see totals and cost by week, approve entries, and export to CSV. Find it under People Access → Timesheet.',
  },
  {
    date: '2026-06-06',
    tag: 'New',
    title: 'App-wide announcements',
    body: "We can now show an announcement banner across ChurchOpsHub to let you know about new features or planned maintenance.",
  },
];
