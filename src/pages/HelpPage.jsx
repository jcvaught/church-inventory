import { useState, useEffect, useRef } from 'react';
import { B, f1, f2, btnP, btnS } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';

/* ─── Section data ─────────────────────────────────────── */
const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'inventory',       label: 'Inventory' },
  { id: 'supplies',        label: 'Supplies' },
  { id: 'reservations',    label: 'Reservations' },
  { id: 'activity-log',    label: 'Activity Log' },
  { id: 'maintenance',     label: 'Maintenance Hub' },
  { id: 'insights',        label: 'Insights Hub' },
  { id: 'coordination',    label: 'Coordination Hub' },
  { id: 'accountability',  label: 'Accountability Hub' },
  { id: 'team',            label: 'Team Hub' },
  { id: 'settings',        label: 'Settings & Billing' },
  { id: 'faq',             label: 'FAQ' },
];

/* ─── Helpers ──────────────────────────────────────────── */
function H2({ children }) {
  return (
    <h2 style={{ fontFamily: f1, fontSize: 22, fontWeight: 700, color: B.navy, margin: '0 0 4px' }}>
      {children}
    </h2>
  );
}

function P({ children, style }) {
  return <p style={{ fontFamily: f2, fontSize: 15, color: B.textMid, lineHeight: 1.65, margin: '0 0 12px', ...style }}>{children}</p>;
}

function UL({ items }) {
  return (
    <ul style={{ margin: '0 0 14px', paddingLeft: 20 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontFamily: f2, fontSize: 15, color: B.textMid, lineHeight: 1.65, marginBottom: 5 }}>{item}</li>
      ))}
    </ul>
  );
}

function Tip({ children }) {
  return (
    <div style={{ background: B.tealPale, border: `1px solid ${B.teal}22`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
      <span style={{ fontFamily: f1, fontWeight: 700, color: B.teal, fontSize: 13, marginRight: 6 }}>TIP</span>
      <span style={{ fontFamily: f2, fontSize: 14, color: B.textMid, lineHeight: 1.6 }}>{children}</span>
    </div>
  );
}

function Note({ children }) {
  return (
    <div style={{ background: B.goldLight, border: `1px solid ${B.gold}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
      <span style={{ fontFamily: f1, fontWeight: 700, color: B.gold, fontSize: 13, marginRight: 6 }}>NOTE</span>
      <span style={{ fontFamily: f2, fontSize: 14, color: B.textMid, lineHeight: 1.6 }}>{children}</span>
    </div>
  );
}

function RoleTag({ role }) {
  const colors = {
    admin:   { bg: '#EEF2FF', color: '#4338CA' },
    manager: { bg: B.goldLight, color: '#92660A' },
    user:    { bg: B.warmGray, color: B.textMid },
  };
  const c = colors[role] || colors.user;
  return (
    <span style={{ background: c.bg, color: c.color, fontFamily: f1, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px', marginRight: 4, textTransform: 'uppercase', letterSpacing: .4 }}>
      {role}
    </span>
  );
}

function HubBadge({ name }) {
  return (
    <span style={{ background: B.tealPale, color: B.teal, fontFamily: f1, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 8px', marginRight: 4, letterSpacing: .3 }}>
      {name}
    </span>
  );
}

function Accordion({ title, sub, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${B.sand}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: open ? B.warmGray : B.white, border: 'none', padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}
      >
        <span style={{ fontFamily: f1, fontWeight: 700, fontSize: 15, color: B.navy, flex: 1 }}>{title}</span>
        {sub && <span style={{ fontFamily: f2, fontSize: 13, color: B.textLight }}>{sub}</span>}
        {badge && <span style={{ background: B.tealPale, color: B.teal, fontFamily: f1, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px' }}>{badge}</span>}
        <span style={{ color: B.textLight, fontSize: 18, lineHeight: 1, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>⌄</span>
      </button>
      {open && (
        <div style={{ padding: '6px 18px 18px', background: B.white, borderTop: `1px solid ${B.sand}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Section({ id, icon, title, badge, children }) {
  return (
    <section id={id} style={{ scrollMarginTop: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, marginTop: 8 }}>
        {icon && <span style={{ fontSize: 22 }}>{icon}</span>}
        <H2>{title}</H2>
        {badge && <HubBadge name={badge} />}
      </div>
      <div style={{ width: 40, height: 3, background: B.teal, borderRadius: 2, marginBottom: 20 }} />
      {children}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* ═══ HELP PAGE ════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════ */

export function HelpPage({ onBack }) {
  const [w, setW] = useState(window.innerWidth);
  const [activeSection, setActiveSection] = useState('getting-started');
  const navRef = useRef(null);

  useEffect(() => {
    let t;
    const handler = () => { clearTimeout(t); t = setTimeout(() => setW(window.innerWidth), 80); };
    window.addEventListener('resize', handler);
    return () => { window.removeEventListener('resize', handler); clearTimeout(t); };
  }, []);

  // Highlight active section in sidebar as user scrolls
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) {
          // pick the one closest to the top of the viewport
          const sorted = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActiveSection(sorted[0].target.id);
        }
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const mob = w < 768;
  const wide = w >= 1100;

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ fontFamily: f2, color: B.textDark, background: B.cream, minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ── TOP NAV ── */}
      <nav style={{
        background: B.navy, padding: mob ? '14px 20px' : '14px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 200,
        boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <FullLogo size={28} light />
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 16, fontWeight: 300 }}>|</span>
          <span style={{ fontFamily: f1, fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>Help Center</span>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            style={{ ...btnS, padding: '7px 16px', fontSize: 13, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
          >
            ← Back to App
          </button>
        )}
      </nav>

      {/* ── SECTION NAV (mobile horizontal scroll) ── */}
      {mob && (
        <div ref={navRef} style={{ background: B.white, borderBottom: `1px solid ${B.sand}`, overflowX: 'auto', display: 'flex', gap: 0, position: 'sticky', top: 56, zIndex: 100, WebkitOverflowScrolling: 'touch' }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              style={{ background: 'none', border: 'none', borderBottom: activeSection === s.id ? `2px solid ${B.teal}` : '2px solid transparent', color: activeSection === s.id ? B.teal : B.textMid, fontFamily: f1, fontWeight: 600, fontSize: 12, padding: '10px 14px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── BODY ── */}
      <div style={{ display: 'flex', maxWidth: wide ? 1140 : '100%', margin: '0 auto', alignItems: 'flex-start' }}>

        {/* ── SIDEBAR (desktop only) ── */}
        {!mob && (
          <aside style={{ width: 220, flexShrink: 0, position: 'sticky', top: 57, height: 'calc(100vh - 57px)', overflowY: 'auto', padding: '28px 0 28px 28px' }}>
            <p style={{ fontFamily: f1, fontWeight: 700, fontSize: 11, color: B.textLight, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>Contents</p>
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: activeSection === s.id ? B.tealPale : 'none', border: 'none', borderLeft: `3px solid ${activeSection === s.id ? B.teal : 'transparent'}`, color: activeSection === s.id ? B.teal : B.textMid, fontFamily: f1, fontWeight: activeSection === s.id ? 700 : 500, fontSize: 13, padding: '7px 12px', cursor: 'pointer', borderRadius: '0 8px 8px 0', marginBottom: 2, transition: 'all .1s' }}
              >
                {s.label}
              </button>
            ))}
          </aside>
        )}

        {/* ── CONTENT ── */}
        <main style={{ flex: 1, padding: mob ? '28px 20px 80px' : '36px 40px 80px', maxWidth: 760, minWidth: 0 }}>

          {/* ──────────────────────────────────── */}
          {/* GETTING STARTED                      */}
          {/* ──────────────────────────────────── */}
          <Section id="getting-started" icon="🚀" title="Getting Started">
            <Accordion title="Creating your church" defaultOpen>
              <P>Go to <strong>churchopshub.com</strong> and click <em>Get Started Free</em>. You'll be asked for:</P>
              <UL items={[
                'Church name — shown throughout the app',
                'Church code — a short, unique identifier your team uses to join (e.g. GRACECC). Letters and numbers only, uppercase recommended.',
                'Your name, email, and a password',
              ]} />
              <P>Your account is created with the <strong>Admin</strong> role. You'll receive a verification email — click the link to confirm your address.</P>
              <Tip>Choose a memorable church code. You'll share it with everyone who joins.</Tip>
            </Accordion>

            <Accordion title="Inviting your team">
              <P>There are two ways to bring people in:</P>
              <UL items={[
                'Share your church code — team members go to the app, click Register, and enter the code.',
                'Send an invite link — go to Settings → Team Members → Copy Invite Link. The link pre-fills the church code and can restrict which hubs the new user can see.',
              ]} />
              <P>New members default to the <strong>User</strong> role. Promote them in Settings → Team Members.</P>
            </Accordion>

            <Accordion title="Understanding roles">
              <div style={{ marginTop: 8 }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 4 }}><RoleTag role="admin" /></div>
                  <P style={{ marginBottom: 0 }}>Full access to everything — team management, billing, church code, all settings, and all hubs.</P>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 4 }}><RoleTag role="manager" /></div>
                  <P style={{ marginBottom: 0 }}>Full operational access scoped to their assigned ministries — add/edit items and supplies, approve reservations, create maintenance tickets and vendors, run audits, manage bundles. Cannot manage team members or billing.</P>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ marginBottom: 4 }}><RoleTag role="user" /></div>
                  <P style={{ marginBottom: 0 }}>Day-to-day use — check out and return items, request reservations, log supply usage. Cannot add or edit items.</P>
                </div>
              </div>
              <Note>Items and supplies with no ministry assigned are admin-only. Managers can only edit items in their assigned ministries.</Note>
            </Accordion>

            <Accordion title="Onboarding checklist">
              <UL items={[
                'Add your locations (e.g. Sanctuary, Sound Booth) in Settings → Locations',
                'Add your ministries (e.g. Worship, Youth) in Settings → Ministries',
                'Add your first inventory item in the Inventory tab',
                'Invite your team members',
                'Print QR labels for high-traffic gear',
              ]} />
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* INVENTORY                            */}
          {/* ──────────────────────────────────── */}
          <Section id="inventory" icon="📦" title="Inventory" >
            <P>The Inventory tab is the core of ChurchOpsHub — free forever. Track every piece of equipment your church owns.</P>

            <Accordion title="Adding items" defaultOpen>
              <P>Click <strong>+ Add Item</strong> (or press <kbd style={{ background: B.warmGray, borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace', fontSize: 13 }}>N</kbd> on desktop). Each item has:</P>
              <UL items={[
                'Item ID — a unique identifier (3+ characters). Used for QR codes and quick lookup.',
                'Description — what the item is',
                'Location — where it lives when not in use',
                'Ministry — which ministry owns or uses it',
                'Status — Available, Checked Out, In Use, Under Repair, or Disposed',
                'Photo — optional; resized automatically before upload',
                'Financial fields (optional) — purchase date, price, warranty expiry, estimated value',
                'Tags — for filtering and search',
                'Notes — free-form text',
              ]} />
              <Tip>Use the ✨ Identify Item button after uploading a photo to have AI pre-fill the description.</Tip>
            </Accordion>

            <Accordion title="Checking out and returning items">
              <P>Open an item and click <strong>Check Out</strong>. Enter who has it and an optional due date. The status changes to <em>Checked Out</em> and the action is logged.</P>
              <P>To return, open the item and click <strong>Return</strong>. You'll be asked for the item's condition.</P>
              <Tip>Use <strong>Bulk Actions</strong> (☑ Select button) to check out or return multiple items at once.</Tip>
            </Accordion>

            <Accordion title="QR codes and labels">
              <P>Every item has a QR code generated from its Item ID. Open an item's detail panel and click <strong>Print Label</strong> to print a label with the QR code and item description.</P>
              <P>Scanning a QR code with the app's <strong>📷 Scan</strong> button (top nav) automatically opens that item's detail view.</P>
            </Accordion>

            <Accordion title="Search, filter, and keyboard shortcuts">
              <UL items={[
                'Search by description, ID, or tags using the search bar (press / to focus)',
                'Filter by location or ministry using the dropdowns',
                'N — open Add Item modal (admin/manager, no modal open)',
                '/ — focus the search input',
                'Esc — close the open modal',
              ]} />
              <P>Location and ministry filters are saved between sessions.</P>
            </Accordion>

            <Accordion title="Duplicating an item">
              <P>Open an item's detail panel and click <strong>⊕ Duplicate</strong>. This opens the Add Item form pre-filled with all the same fields — just clear or update the Item ID and save.</P>
              <P>Also available on desktop in the item row without opening the detail panel.</P>
            </Accordion>

            <Accordion title="Bulk actions">
              <P>Click <strong>☑ Select</strong> in the toolbar to enter bulk mode. Checkboxes appear on each item card. Then:</P>
              <UL items={[
                'Bulk Checkout — checks out all selected Available items (skips others with a warning)',
                'Bulk Return — returns all selected checked-out items (single condition prompt)',
                'Bulk Location — moves all selected items to a new location',
                'Bulk Export — exports selected items to CSV',
              ]} />
            </Accordion>

            <Accordion title="Public item request form">
              <P>Admins can generate a public link (Settings → Team Members → Copy Request Form Link) that anyone — no account required — can use to request items from your church.</P>
              <P>Submissions appear in a panel at the top of the Inventory tab for admins to review and dismiss.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* SUPPLIES                             */}
          {/* ──────────────────────────────────── */}
          <Section id="supplies" icon="🧴" title="Supplies">
            <P>Track consumable quantities — batteries, cables, cleaning products, offering envelopes, and anything else you restock.</P>

            <Accordion title="Adding and tracking supplies" defaultOpen>
              <UL items={[
                'Name, category, location, ministry',
                'Current quantity + unit (e.g. "48 rolls")',
                'Low-stock threshold — highlighted when quantity falls at or below this number',
                'Notes',
              ]} />
              <P>Use <strong>Log Usage</strong> to reduce quantity and <strong>Restock</strong> to increase it. Every change is logged.</P>
            </Accordion>

            <Accordion title="Low-stock alerts">
              <P>Supplies at or below their threshold are shown with a red badge. The Dashboard also surfaces a low-stock count for quick visibility.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* RESERVATIONS                         */}
          {/* ──────────────────────────────────── */}
          <Section id="reservations" icon="📅" title="Reservations">
            <P>Let your team request items in advance. Admins and managers approve or deny requests.</P>

            <Accordion title="Creating a reservation" defaultOpen>
              <P>Click <strong>+ Reserve</strong>. Select the item, dates, purpose, and requester. For recurring needs, enable <strong>Repeat</strong> and choose weekly, biweekly, or monthly with an end date — the app shows a live count of instances before you save.</P>
            </Accordion>

            <Accordion title="Approving and denying">
              <P>Pending reservations show in the Reservations tab. Admins and managers can approve (which checks the item out) or deny. If EmailJS is configured (Coordination Hub), the requester receives an automatic email notification.</P>
            </Accordion>

            <Accordion title="Recurring reservations">
              <P>All instances in a recurring series are linked via a <em>recurrence group ID</em>. They display with a recurring badge. Cancelling one instance does not affect the others.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* ACTIVITY LOG                         */}
          {/* ──────────────────────────────────── */}
          <Section id="activity-log" icon="📋" title="Activity Log">
            <P>Every action in the app is recorded automatically — checkouts, returns, edits, status changes, supply adjustments, and more.</P>

            <Accordion title="Using the activity log" defaultOpen>
              <UL items={[
                'Filter by date range using the From/To pickers',
                'Entries show the action, item, actor, and timestamp',
                'Load more entries with the "Load more" button at the bottom (loads 20 at a time)',
                'Export to CSV for external reporting',
              ]} />
              <Note>The log is append-only. Entries cannot be edited or deleted.</Note>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* MAINTENANCE HUB                      */}
          {/* ──────────────────────────────────── */}
          <Section id="maintenance" icon="🔧" title="Maintenance Hub" badge="$7/mo">
            <P>Track repairs, coordinate contractors, and document issues with photos and comments.</P>

            <Accordion title="Creating a ticket" defaultOpen>
              <P>Click <strong>+ New Ticket</strong>. Fields include:</P>
              <UL items={[
                'Name and description',
                'Priority — High, Medium, or Low',
                'Status — Backlog, Planning, In Progress, On Hold, Complete, Cancelled',
                'Assignees — one or more team members',
                'Due date',
                'Tags — searchable labels',
                'Linked item — attach a ticket to a specific inventory item',
                'Vendor — assign to a contractor from your vendor directory',
                'Estimated and actual cost',
                'Photos — upload multiple images',
              ]} />
              <P>Tickets are auto-numbered (MNT-001, MNT-002, …).</P>
            </Accordion>

            <Accordion title="Kanban view">
              <P>Switch to <strong>Kanban</strong> for a column-per-status view. Admins and managers can drag cards between columns. Dropping a card updates the status in real time.</P>
              <P>The stat bar at the top shows counts: Open (all non-Complete, non-Cancelled), In Progress, Overdue, and Complete.</P>
            </Accordion>

            <Accordion title="Comments and photos">
              <P>Open a ticket to add comments (real-time thread) and photos. Photos are stored in Firebase Storage and linked to the ticket.</P>
            </Accordion>

            <Accordion title="Vendor directory">
              <P>Go to the <strong>Vendors</strong> tab to add contractors and service companies. Each vendor has a name, contact, phone, email, and notes. Assign vendors to tickets for tracking.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* INSIGHTS HUB                         */}
          {/* ──────────────────────────────────── */}
          <Section id="insights" icon="📊" title="Insights Hub" badge="$7/mo">
            <P>Understand how your inventory is actually used — utilization patterns, ministry breakdowns, seasonal trends, and financial depreciation.</P>

            <Accordion title="Item Utilization" defaultOpen>
              <P>Bar chart showing checkout frequency by item. Quickly see which items are in constant use and which haven't moved in months.</P>
            </Accordion>

            <Accordion title="Ministry Breakdown">
              <P>Pie chart of inventory distribution and usage by ministry. Useful for resource allocation conversations.</P>
            </Accordion>

            <Accordion title="Seasonal Trends">
              <P>Area chart of checkout volume over time. Spot busy seasons (Christmas, Easter, summer camps) at a glance.</P>
            </Accordion>

            <Accordion title="Financial & Depreciation">
              <P>Requires financial fields on items (purchase date, purchase price, estimated value). The hub calculates straight-line depreciation over 5 years and flags items within 90 days of warranty expiry.</P>
              <Tip>Add financial data in the item's edit modal under the Financial section.</Tip>
            </Accordion>

            <Accordion title="Supply Burn Rate">
              <P>Charts supply usage over time so you can forecast when you'll need to restock.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* COORDINATION HUB                     */}
          {/* ──────────────────────────────────── */}
          <Section id="coordination" icon="🤝" title="Coordination Hub" badge="$7/mo">
            <P>Streamline event prep with checkout bundles and automatic email notifications.</P>

            <Accordion title="Checkout bundles" defaultOpen>
              <P>A bundle is a saved collection of items you regularly check out together — e.g., "Sunday Worship Setup" with mics, stands, and a mixer.</P>
              <UL items={[
                'Create a bundle by clicking + New Bundle and selecting items',
                'Each item shows its current availability status in the bundle view',
                'Bulk checkout a bundle — unavailable items are skipped with a warning',
              ]} />
            </Accordion>

            <Accordion title="Email notifications">
              <P>Connect EmailJS to send automatic emails when reservations are approved or denied. Go to Coordination Hub → Notification Settings and enter your:</P>
              <UL items={[
                'EmailJS Service ID',
                'Public Key',
                'Approved template ID',
                'Denied template ID',
              ]} />
              <P>Use the <strong>Send Test</strong> button to verify the connection before going live.</P>
              <Note>EmailJS is a free third-party service. You'll need a free account at emailjs.com to get these credentials.</Note>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* ACCOUNTABILITY HUB                   */}
          {/* ──────────────────────────────────── */}
          <Section id="accountability" icon="✅" title="Accountability Hub" badge="$5/mo">
            <P>Run physical inventory audits, track chain of custody, and export insurance-ready reports.</P>

            <Accordion title="Running an audit" defaultOpen>
              <P>Click <strong>Start Audit</strong> and select a location. The app lists all items assigned to that location. Walk through each item and mark it:</P>
              <UL items={[
                'Present — item is here and accounted for',
                'Issue — item is present but has a problem (add notes)',
                'Missing — item cannot be found',
              ]} />
              <P>Complete the audit to save the results. Discrepancies are highlighted in the audit history.</P>
            </Accordion>

            <Accordion title="Chain of custody">
              <P>For any item, view a timeline of every person who has checked it out and returned it, pulled from the activity log.</P>
            </Accordion>

            <Accordion title="Insurance CSV export">
              <P>Export a CSV of all active items with their financial fields (purchase date, price, estimated value, warranty) — formatted for insurance reporting. Accessible from the Accountability Hub header.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* TEAM HUB                             */}
          {/* ──────────────────────────────────── */}
          <Section id="team" icon="👤" title="Team Hub" badge="$9–$19/mo">
            <P>Scale beyond the free 10-member limit and control exactly which hubs each person can access.</P>

            <Accordion title="Plans" defaultOpen>
              <UL items={[
                '$9/mo — up to 25 team members',
                '$19/mo — unlimited team members',
              ]} />
              <P>Both plans include full hub access controls per user.</P>
            </Accordion>

            <Accordion title="Per-user hub access">
              <P>In Settings → Team Members, click a user's <strong>Edit Access</strong> button to set:</P>
              <UL items={[
                'Role (Admin / Manager / User)',
                'Which hubs they can see (only hubs your church has subscribed to are shown)',
                'Managed ministries (for the Manager role)',
              ]} />
              <Note>Admins always see all hubs regardless of hub access settings.</Note>
            </Accordion>

            <Accordion title="Invite links with hub restrictions">
              <P>When generating an invite link (Settings → Team Members → Copy Invite Link), you can uncheck specific hubs. New users who register via that link will only see the hubs you selected.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* SETTINGS & BILLING                   */}
          {/* ──────────────────────────────────── */}
          <Section id="settings" icon="⚙️" title="Settings & Billing">

            <Accordion title="Locations, Ministries, and Tags" defaultOpen>
              <P>Manage these dropdown lists in Settings. Admins and managers can add and remove entries. Changes take effect immediately across the app.</P>
            </Accordion>

            <Accordion title="Church code">
              <P>Your church code is shown in Settings → Church Info. Use the copy button to share it. Admins can change it (requires confirmation) — existing members are unaffected since their profiles already store the church ID.</P>
            </Accordion>

            <Accordion title="Subscription and billing">
              <P>Admins see a <strong>Subscription & Billing</strong> card in Settings. From there:</P>
              <UL items={[
                'Upgrade — opens Stripe checkout to subscribe to a hub or plan',
                'Manage Billing — opens the Stripe portal to update payment, view invoices, or cancel',
              ]} />
              <P>Changes take effect immediately after payment. Cancellation takes effect at the end of the billing period.</P>
            </Accordion>

            <Accordion title="Deleting your account">
              <P>Go to Settings → Danger Zone → Delete Account. You'll need to type DELETE and re-enter your password (or re-authenticate with Google). This removes your login and profile. Church inventory data remains — contact us to fully delete your church's data.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* FAQ                                  */}
          {/* ──────────────────────────────────── */}
          <Section id="faq" icon="❓" title="FAQ">

            <Accordion title="Is my data isolated from other churches?" defaultOpen>
              <P>Yes. Every church's data is stored under a unique church ID in Firestore. Firestore security rules are scoped to prevent any cross-church access — even if someone knows your church code, they cannot read your data without being an authenticated member of your church.</P>
            </Accordion>

            <Accordion title="What happens if I cancel a paid hub?">
              <P>The hub remains active until the end of your current billing period. After that, the hub tab shows a locked state (🔒) and your data is preserved — it's just inaccessible until you resubscribe.</P>
            </Accordion>

            <Accordion title="Can I use ChurchOpsHub on mobile?">
              <P>Yes. The app is a progressive web app (PWA) optimized for both desktop and mobile. On mobile, navigation moves to a bottom bar and modals slide up from the bottom. You can also add it to your home screen from your browser's share/menu.</P>
            </Accordion>

            <Accordion title="How do QR codes work?">
              <P>QR codes are generated locally (no external service) from each item's Item ID. They link directly to your app with a <code style={{ background: B.warmGray, borderRadius: 4, padding: '1px 5px', fontSize: 13 }}>?item=ITEM_ID</code> URL parameter. Anyone with a login can scan and jump straight to that item's detail view using the 📷 Scan button in the top nav.</P>
            </Accordion>

            <Accordion title="How many items can I add?">
              <P>There's no limit on items or supplies on any plan. Limits only apply to team member count (10 on free, 25 or unlimited on Team Hub plans).</P>
            </Accordion>

            <Accordion title="Can I export my data?">
              <P>Yes. Inventory, supplies, reservations, and the activity log all have CSV export options. The Accountability Hub also offers an insurance-ready CSV with financial fields.</P>
            </Accordion>

            <Accordion title="What is the All-In Bundle?">
              <P>The All-In Bundle ($29/mo) includes all five paid hubs — Maintenance, Insights, Coordination, Accountability, and Team (unlimited users) — at a significant discount versus subscribing individually.</P>
            </Accordion>

            <Accordion title="How do I report a bug or request a feature?">
              <P>Use the <strong>Suggest a Feature / Report a Bug</strong> button in Settings. Your feedback goes directly to us and is reviewed regularly.</P>
            </Accordion>
          </Section>

          {/* ── Footer ── */}
          <div style={{ marginTop: 60, paddingTop: 28, borderTop: `1px solid ${B.sand}`, textAlign: 'center' }}>
            <p style={{ fontFamily: f1, fontWeight: 700, color: B.textLight, fontSize: 13, marginBottom: 6 }}>ChurchOpsHub</p>
            <p style={{ fontFamily: f2, fontSize: 13, color: B.textLight, margin: 0 }}>
              Questions? Email us at{' '}
              <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a>
            </p>
          </div>

        </main>
      </div>
    </div>
  );
}
