import { useState, useEffect, useRef } from 'react';
import { B, f1, f2, btnS } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';
import { SEO } from '../components/SEO.jsx';

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
  { id: 'people-access',   label: 'People Access Hub' },
  { id: 'tasks',           label: 'Tasks Hub' },
  { id: 'jobs',            label: 'Job Hub' },
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

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Is my data isolated from other churches?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes. Every church\'s data is stored under a unique church ID in Firestore. Security rules prevent any cross-church access — even if someone knows your church code, they cannot read your data without being an authenticated member of your church.' } },
      { '@type': 'Question', name: 'What happens if I cancel?',
        acceptedAnswer: { '@type': 'Answer', text: 'Your plan stays active until the end of your current billing period. After that, the paid hubs show a locked state and your data is preserved — it\'s just inaccessible until you resubscribe. Your free Inventory, supplies, and reservations are unaffected.' } },
      { '@type': 'Question', name: 'Can I use ChurchOpsHub on mobile?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes. The app is a progressive web app (PWA) optimized for both desktop and mobile. On mobile, navigation moves to a bottom bar and modals slide up from the bottom. You can also install it to your home screen from your browser\'s share menu.' } },
      { '@type': 'Question', name: 'How do QR codes work?',
        acceptedAnswer: { '@type': 'Answer', text: 'QR codes are generated locally (no external service) from each item\'s Item ID. They link directly to your app with a ?item=ITEM_ID URL parameter. Anyone with a login can scan and jump straight to that item\'s detail view using the Scan button in the top nav.' } },
      { '@type': 'Question', name: 'How many items can I add?',
        acceptedAnswer: { '@type': 'Answer', text: 'There is no limit on items or supplies on any plan. Limits only apply to team member count: 10 on the free plan, 25 or unlimited on Team Hub plans.' } },
      { '@type': 'Question', name: 'Can I export my data?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes. Inventory, supplies, reservations, and the activity log all have CSV export options. The Accountability Hub also offers an insurance-ready CSV with financial fields.' } },
      { '@type': 'Question', name: 'How much does ChurchOpsHub cost?',
        acceptedAnswer: { '@type': 'Answer', text: 'Inventory, supplies, and reservations are free forever for up to 10 team members. Everything else — Maintenance, Insights, Coordination, Accountability, People Access, Tasks, and Jobs — is included in one flat ChurchOpsHub plan: $15/month or $150/year, with unlimited team members. There are no per-hub add-ons or seat tiers. New churches get a 90-day free trial of all paid features.' } },
      { '@type': 'Question', name: 'How do I report a bug or request a feature?',
        acceptedAnswer: { '@type': 'Answer', text: 'Use the Suggest a Feature / Report a Bug button in Settings. Your feedback goes directly to us and is reviewed regularly.' } },
    ],
  };

  return (
    <div style={{ fontFamily: f2, color: B.textDark, background: B.cream, minHeight: '100vh' }}>
      <SEO
        title="Help Center — ChurchOpsHub"
        description="Find answers about ChurchOpsHub. Guides for inventory, supplies, reservations, maintenance, jobs, tasks, and more."
        canonical="/?help"
        jsonLd={faqJsonLd}
      />
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
                'Description — what the item is (fill this first)',
                'Item ID — auto-filled from the description as you type (e.g. "Wireless Microphone" → MIC-001). Edit it if you want something different.',
                'Location — where it lives when not in use',
                'Ministry — which ministry owns or uses it',
                'Status — Available, Checked Out, In Use, Under Repair, or Disposed',
                'Photo — optional; resized automatically before upload',
                'Financial fields (optional) — purchase date, price, warranty expiry, estimated value',
                'Tags — for filtering and search; type a new tag name and click + Add to create one on the spot',
                'Notes — free-form text',
              ]} />
              <Tip>Use the <strong>✨ Identify Item</strong> button in the Add Item modal to take or select a photo and have AI pre-fill the description — the Item ID auto-fills from the AI result too.</Tip>
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
              <P>Open an item's detail panel and click <strong>⊕ Duplicate</strong>. This opens the Add Item form pre-filled with all the same fields. The Item ID is auto-generated from the description — edit it if the duplicate needs a different identifier, then save.</P>
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
              <Note>Checkout, Return, and Location actions each show a confirmation dialog before executing.</Note>
            </Accordion>

            <Accordion title="Retiring vs. deleting items">
              <P><strong>Retire</strong> marks an item as Disposed and moves it to the retired list — it stays in your records for history and reporting. Use this for equipment that is broken, lost, or decommissioned.</P>
              <P><strong>Delete</strong> permanently removes the item from Firestore. Use this only to remove items that were added by mistake. Activity history is preserved in the Activity Log.</P>
              <P><RoleTag role="admin" /> The <strong>Delete</strong> button is in the item detail panel, admin only. A confirmation dialog shows before anything is removed.</P>
              <Note>Both Retire and Delete are in the item detail panel footer. Retire is available to admins and managers; Delete is admin only.</Note>
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
                'Description — fill this first; the Supply ID auto-fills as you type (e.g. "AA Batteries" → AAB-001)',
                'Supply ID — auto-generated, editable if you want something different',
                'Location, ministry',
                'Current quantity + unit (e.g. "48 rolls")',
                'Low-stock threshold — highlighted when quantity falls at or below this number',
                'Tags — for filtering; type a new tag name and click + Add to create one on the spot',
              ]} />
              <P>Use <strong>Log Usage</strong> to reduce quantity and <strong>Restock</strong> to increase it. Every change is logged.</P>
              <Tip>Not sure what something is? Use <strong>✨ Identify Item</strong> in the Add Supply modal to have AI pre-fill the description from a photo — the Supply ID auto-fills from the AI result too.</Tip>
            </Accordion>

            <Accordion title="Identifying a supply with AI">
              <P>In the <strong>Add Supply</strong> modal, click <strong>✨ Identify Item</strong> and take or select a photo of the item. AI will analyze the photo and automatically fill in the Description field.</P>
              <UL items={[
                'The photo is used for identification only — it is not saved or stored anywhere',
                'Works best with a clear, well-lit photo of the item or its packaging',
                'You can edit the description after identification if needed',
              ]} />
              <Note>This feature uses the same AI identification available when adding inventory items.</Note>
            </Accordion>

            <Accordion title="Editing a supply">
              <P>Click <strong>Edit</strong> on any supply card to update its description, location, ministry, minimum quantity, unit, and tags.</P>
              <P><RoleTag role="admin" /> Admins also see a <strong>Current Quantity</strong> field in the edit modal to correct a counting mistake without creating a misleading use or restock entry.</P>
            </Accordion>

            <Accordion title="Low-stock alerts">
              <P>Supplies at or below their threshold are shown with a red badge. The Dashboard also surfaces a low-stock count for quick visibility.</P>
              <Tip>Use the tag filter pills in the search bar to quickly view all supplies of a certain type (e.g. "Cleaning", "Office").</Tip>
            </Accordion>

            <Accordion title="Finding, filtering, and sorting supplies">
              <P>Use the search box to find a supply by description or Supply ID. Below it, the <strong>location</strong> dropdown narrows the list to a single location, and the <strong>sort</strong> dropdown reorders supplies alphabetically (A–Z or Z–A) or back to the default order.</P>
              <Tip>Your location filter and sort choice are remembered on this device, so the Supplies page opens the way you left it.</Tip>
            </Accordion>

            <Accordion title="Deleting a supply">
              <P><RoleTag role="admin" /> Admins can permanently delete a supply using the <strong>Delete</strong> button on its card. A confirmation dialog shows the supply name and ID before anything is removed.</P>
              <Note>Deleting a supply is permanent and cannot be undone. Activity history (usage and restock logs) is preserved in the Activity Log.</Note>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* RESERVATIONS                         */}
          {/* ──────────────────────────────────── */}
          <Section id="reservations" icon="📅" title="Reservations">
            <P>Reserve two kinds of things in advance: <strong>Equipment</strong> (an inventory item) and <strong>Spaces</strong> (a room or area). Your team requests them; admins and managers approve or deny. You'll find it under <strong>Hubs → Reservations Hub</strong>.</P>

            <Accordion title="Setting up your Spaces (rooms) — do this first" defaultOpen badge="Admin / Manager">
              <P>Before anyone can reserve a room, an admin or manager has to define your church's spaces. If the booking screen says <em>"No spaces defined yet,"</em> that's this step.</P>
              <UL items={[
                'Go to Settings (top navigation), then find the 🏛️ Spaces card',
                'Click Manage Spaces',
                'Fill in the space — only Name is required:',
              ]} />
              <UL items={[
                'Name — e.g. "Sanctuary", "Fellowship Hall", "Room 5" (required)',
                'Capacity — max occupancy (optional); used to warn when an event\'s expected attendance is too big for the room',
                'Location — e.g. "Main Building", "Annex" (optional)',
                'Description — a short note about the space (optional)',
                'Amenities — comma-separated, e.g. "Projector, Sound System, Whiteboard" (optional)',
                'Photo — a picture of the space, so people booking it know what they\'re reserving (optional)',
              ]} />
              <P>You can also fine-tune how each space is booked:</P>
              <UL items={[
                'Approvers — pick specific people (e.g. your facilities coordinator) who can approve bookings for THIS space. Admins can always approve; this adds others without making them admins.',
                'Blackout dates — specific days the space can\'t be booked (a holiday, a renovation week).',
                'Weekly blocked hours — recurring times the space is off-limits, like "Sunday 9:00–12:00" for the worship service. The app will refuse any booking that lands in those hours.',
              ]} />
              <P>Click <strong>Add Space</strong> and repeat for each room. Spaces can be edited or removed from the same Manage Spaces window — removing a space is a soft-archive, so it stops showing up in new bookings without disturbing past reservations.</P>
              <Note>Only admins and managers can create or edit spaces. Everyone else can reserve them.</Note>
            </Accordion>

            <Accordion title="Reserving a space or piece of equipment" defaultOpen>
              <P>In the Reservations Hub, click <strong>+ New Reservation</strong>, then pick <strong>📦 Equipment</strong> or <strong>🏛️ Space</strong> at the top of the form. Enter the event/purpose, ministry, and date(s). For recurring needs, turn on <strong>Repeat this reservation</strong> and choose a frequency and end date — the form shows a live count of how many will be created.</P>
              <P>For a <strong>space</strong>, you can also record the <strong>expected attendance</strong> and a <strong>day-of contact</strong> name and phone. If the attendance is larger than the room's capacity, you'll get a gentle heads-up — it won't stop you, it just flags it so you can plan overflow seating or pick a bigger room.</P>
            </Accordion>

            <Accordion title="Booking a room by time of day" badge="New">
              <P>Space reservations can have a <strong>start and end time</strong>, not just a date — so you can book the same room for a morning event <em>and</em> an evening event on the same day. When you choose <strong>🏛️ Space</strong>, set the Start time and End time, or check <strong>All day</strong> to hold the room for the whole day.</P>
              <UL items={[
                'ChurchOpsHub checks for conflicts automatically — two groups cannot book the same space for the same time. You\'ll see a message telling you what it conflicts with.',
                'Back-to-back bookings are fine (one ending at 12:00 and another starting at 12:00 do not conflict).',
                'An "All day" booking holds the room for that whole day, so nothing else can be booked that day.',
                'Multi-day bookings (a different return date) are treated as all-day for the whole span — useful for a lock-in or camp.',
                'If a space has blackout dates or weekly blocked hours set up (like Sunday service), the app will refuse a booking that lands in them and tell you why.',
                'Equipment reservations stay date-based (no time of day).',
              ]} />
              <Tip>Times also flow into the calendar feed, so a room booked 9–11am shows at the right time when you subscribe to the calendar in Google or Apple Calendar (see Settings → Calendar Feed).</Tip>
            </Accordion>

            <Accordion title="Approving and denying">
              <P>Pending reservations show in the Reservations Hub. Admins and managers can approve or deny. For equipment, approving lets you check the item out; for a space, you can mark the booking complete when it's done. When email notifications are on, the requester is notified automatically of the decision.</P>
            </Accordion>

            <Accordion title="Recurring reservations">
              <P>All instances in a recurring series are linked together and display with a recurring badge. Each occurrence is conflict-checked when you create the series, so the app warns you if any date (or time, for a room) is already taken. Cancelling one instance does not affect the others.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* ACTIVITY LOG                         */}
          {/* ──────────────────────────────────── */}
          <Section id="activity-log" icon="📋" title="Activity Log">
            <P>Every action in the app is recorded automatically — checkouts, returns, edits, status changes, supply adjustments, and more.</P>

            <Accordion title="Using the activity log" defaultOpen>
              <UL items={[
                'Filter by date range using the From/To pickers — the To date must be on or after the From date',
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
          <Section id="maintenance" icon="🔧" title="Maintenance Hub" badge="Included in plan">
            <P>Track repairs, coordinate contractors, and document issues with photos and comments.</P>

            <Accordion title="Creating a ticket" defaultOpen>
              <P>Click <strong>+ New Ticket</strong>. Fields include:</P>
              <UL items={[
                'Name and description',
                'Priority — High, Medium, or Low',
                'Due date',
                'Recurrence — set a ticket to repeat (Weekly, Every 2 weeks, Monthly, Quarterly, Annually)',
                'Assignees — one or more team members',
                'Tags — searchable labels',
                'Linked item — attach a ticket to a specific inventory item',
                'Vendor — assign to a contractor from your vendor directory',
                'Estimated cost',
                'Photos — upload multiple images',
              ]} />
              <P>Tickets are auto-numbered (MNT-001, MNT-002, …). Status starts at Backlog and can be moved through: Backlog → Planning → In Progress → On Hold → Complete → Cancelled.</P>
            </Accordion>

            <Accordion title="Recurring tickets">
              <P>Set a recurrence on any ticket (Weekly, Every 2 weeks, Monthly, Quarterly, Annually). When you mark a recurring ticket <strong>Complete</strong>, the app automatically creates the next ticket with all the same fields and the next due date calculated from the previous one.</P>
              <Tip>Use recurring tickets for preventive maintenance — HVAC filters, fire extinguisher checks, generator tests, etc.</Tip>
            </Accordion>

            <Accordion title="Checklist sub-tasks">
              <P>Open a ticket and scroll to <strong>Checklist</strong>. Type an item and press Enter (or click Add) to add it. Check items off as you work. The card shows your progress (e.g. ✓ 3/5) at a glance.</P>
              <P>Checklist items are saved when you click <strong>Save Changes</strong>. When a recurring ticket auto-creates, all checklist items carry over with their done state reset.</P>
            </Accordion>

            <Accordion title="Kanban and list views">
              <P>Switch between <strong>Kanban</strong> (column per status) and <strong>List</strong> (grouped by status, collapsible) using the toggle. Admins and managers can drag cards between kanban columns to update status in real time.</P>
              <P>Use the <strong>Sort</strong> dropdown to order tickets by Newest, Oldest, Priority (High→Low), or Due date (Earliest). Sorting applies within each column or group.</P>
              <P>The stat bar shows counts: Open (all non-Complete, non-Cancelled), In Progress, Completed This Month, and Overdue.</P>
            </Accordion>

            <Accordion title="My tickets filter">
              <P>Click <strong>My tickets</strong> in the filter bar to see only tickets assigned to you. To assign yourself, open a ticket and click <strong>Me</strong> in the Assignees field, then save.</P>
            </Accordion>

            <Accordion title="Comments and photos">
              <P>Open a ticket to add comments (real-time thread) and photos. The description, notes, and comment fields support bullet lists and numbered lists using the toolbar above each field.</P>
            </Accordion>

            <Accordion title="Vendor directory">
              <P>Click <strong>Vendors</strong> to add contractors and service companies. Each vendor has a name, specialty, phone, email, and notes. Assign vendors to tickets for tracking.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* INSIGHTS HUB                         */}
          {/* ──────────────────────────────────── */}
          <Section id="insights" icon="📊" title="Insights Hub" badge="Included in plan">
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

            <Accordion title="Location Report">
              <P>Select a location to see every active item and supply stored there in one combined view. Shows item status (color-coded) and supply stock levels alongside ministry assignment.</P>
              <UL items={[
                'Items table — ID, description, status, ministry',
                'Supplies table — ID, description, quantity (red if below minimum), ministry',
                'Export CSV — downloads a combined file with both items and supplies for that location',
              ]} />
              <Tip>Use this before an event to do a quick walk-through of a room and confirm everything is present.</Tip>
            </Accordion>

            <Accordion title="Weekly email digest">
              <P>Admins can get a Monday-morning email recap of the alerts that matter most — warranty expirations, supplies running low, and your most-used items. Turn it on under <strong>Settings → Church Settings → Weekly Email Digests</strong>. It only sends when there's something to report.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* COORDINATION HUB                     */}
          {/* ──────────────────────────────────── */}
          <Section id="coordination" icon="🤝" title="Coordination Hub" badge="Included in plan">
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
              <P>Enable automatic email notifications from Coordination Hub → Email Notifications → Configure. When enabled, emails are sent automatically for:</P>
              <UL items={[
                'Reservation approved — requester is notified when their request is approved',
                'Reservation denied — requester is notified when their request is denied',
                'Ticket assigned — team member is notified when assigned to a maintenance or task ticket',
                'Job announcement — all Job Hub users are notified when a new announcement is posted',
                'Job cancelled — signed-up members are notified when a job is cancelled or closed',
                'Job reminder — signed-up members receive a morning reminder on the day of their job (sent at 8am)',
                'Job withdrawal — the job poster (and any report delegates) is notified when a member withdraws',
                'Co-admin cancellation — the original job poster is notified when a different admin cancels their job',
              ]} />
              <P>Emails are sent via SendGrid from <strong>churchopshub@gmail.com</strong>. No additional configuration is needed beyond toggling notifications on.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* ACCOUNTABILITY HUB                   */}
          {/* ──────────────────────────────────── */}
          <Section id="accountability" icon="✅" title="Accountability Hub" badge="Included in plan">
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
          {/* PEOPLE ACCESS HUB                    */}
          {/* ──────────────────────────────────── */}
          <Section id="people-access" icon="🔑" title="People Access Hub" badge="Included in plan">
            <P>Track compliance milestones for the people who serve at your church — background checks, key and fob assignments, certifications (CPR, SafeGuarding, etc.), and any custom requirement you need to record.</P>
            <Note>People Access Hub is admin and manager only. Users with the <strong>User</strong> role cannot see this hub even if their <code>allowedHubs</code> includes it.</Note>

            <Accordion title="Adding people" defaultOpen>
              <P>Click <strong>+ Add Person</strong> on the People view. Fields:</P>
              <UL items={[
                'Name (required) — must match exactly if you later use Bulk Entry',
                'Email and phone — optional contact info',
                'Ministries — check all that apply (uses your church\'s ministry list)',
                'Notes — free-form text',
              ]} />
              <P>People can be <strong>archived</strong> (not deleted) — their records are preserved for audit history. Toggle the Archived filter to view or restore them.</P>
            </Accordion>

            <Accordion title="Record types">
              <P>Open a person and click <strong>+ Add Record</strong>. There are four record types:</P>
              <UL items={[
                '🔍 Background Check — completion date + optional expiry. Track who has been screened and when their screening lapses.',
                '🔑 Key / Fob Assignment — what key or access card was issued, when, and (when returned) the return date. Active keys show a "🔑 N keys out" counter on the person card.',
                '🎓 Certification — admin only. Cert type (CPR/First Aid, SafeGuarding, etc.), issuing organization, completion date, and optional expiry.',
                '✅ Custom Requirement — pick from custom requirements your church has defined (e.g. "Driver Training", "Insurance Form Signed").',
              ]} />
              <P>Every record stores who recorded it and when, plus optional ministry and notes.</P>
            </Accordion>

            <Accordion title="Expiry tracking and alerts">
              <P>For any record with an expiry date, the hub shows a status badge based on how soon it expires:</P>
              <UL items={[
                '🔴 Expired or expiring within 7 days — critical',
                '🟡 Expiring within 30 days — warning',
                '✅ More than 30 days out — ok',
              ]} />
              <P>An alert banner at the top of the People Access page lists all expiring records, grouped by severity. Click any name to jump straight to that person\'s record list. Person cards are bordered red or gold when any of their records are critical or warning.</P>
              <Tip>The Settings page also shows a compliance badge (🔴/🟡) next to team members whose linked records are expiring.</Tip>
            </Accordion>

            <Accordion title="Serving readiness & weekly digest">
              <P>The <strong>✅ Readiness</strong> view gives you an at-a-glance picture of who is cleared to serve. A by-requirement table shows, across your active people, how many are clear, renewing (still valid but expiring within 30 days), expired, or have no record on file — with a "Required for shifts" badge on any requirement an upcoming job depends on. Below it, an expiry timeline lists everything coming due in the next 90 days.</P>
              <P>Admins can also turn on a <strong>weekly compliance email</strong> (Settings → Church Settings → Weekly Email Digests) that lists records expired or expiring within 30 days every Monday morning. It only sends when something needs attention.</P>
            </Accordion>

            <Accordion title="Custom requirements">
              <P>Switch to the <strong>📋 Requirements</strong> view to manage custom requirement types. Built-in types (Background Check, Key Assignment, Certification) are always available; custom requirements let you add anything specific to your church.</P>
              <UL items={[
                'Type a name (e.g. "Driver Training", "Insurance Form Signed")',
                'Check "Has expiry" if the requirement should be tracked with an expiration date',
                'Click Add — it\'s immediately available as a "Custom" record type when adding records',
              ]} />
              <P>Custom requirements can be added by admins and managers. Remove one by clicking the × — existing records using it remain in the database but display without the requirement name.</P>
            </Accordion>

            <Accordion title="Bulk entry">
              <P>Click <strong>≡ Bulk Entry</strong> to add the same type of record for multiple people at once — useful for entering a stack of newly completed background checks or a CPR class roster.</P>
              <UL items={[
                'Pick the record type and (for certifications) the cert type or custom requirement',
                'Set the expiry mode — None, Interval (1–5 years from completion date), or Per row (different expiry per person)',
                'Type each name in the Name column (autocompletes from existing people)',
                'Add the completed date for each row; rows with empty name or date are skipped',
              ]} />
              <Note>Names must match an existing active person exactly. Rows with names that don\'t match are flagged in the result banner — you can then add the missing people and re-run.</Note>
            </Accordion>

            <Accordion title="Linking a person to a user account">
              <P><RoleTag role="admin" /> Open a person\'s detail modal and click <strong>🔗 Link to user account</strong>, then pick the user from the dropdown. Once linked:</P>
              <UL items={[
                'That user sees their own compliance records on Settings → My Compliance',
                'Settings → Team Members shows their compliance badge next to their name',
                'Job Hub uses the link to gate signups: jobs with Required Access Types only allow signups from users whose linked person has those records',
              ]} />
              <P>Click <strong>Unlink</strong> to break the connection at any time — the person record and all their compliance records are preserved.</P>
            </Accordion>

            <Accordion title="Permissions at a glance">
              <UL items={[
                'Admin — everything (add/edit/archive people, all record types including certifications, custom requirements, link to user accounts)',
                'Manager — same as admin except cannot add or edit certifications, and cannot link people to user accounts',
                'User — cannot see People Access Hub at all',
              ]} />
            </Accordion>

            <Accordion title="CSV export">
              <P>Click <strong>⬇ Export CSV</strong> in the page header to download all access records (across all people) as a spreadsheet. Useful for compliance audits, insurance reviews, or board reports.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* TASKS HUB                            */}
          {/* ──────────────────────────────────── */}
          <Section id="tasks" icon="✅" title="Tasks Hub" badge="Included in plan">
            <P>A general-purpose Kanban task board for church admin work — assign tasks, track progress, and control who sees what.</P>

            <Accordion title="Creating a task" defaultOpen>
              <P>Click <strong>+ New Task</strong>. Fields include:</P>
              <UL items={[
                'Name and description',
                'Priority — High, Medium, or Low',
                'Due date and recurrence',
                'Assignees — one or more team members',
                'Tags — searchable labels',
                'Visibility — Team, Private, or Shared (see below)',
                'Photos and notes',
              ]} />
              <P>Tasks are auto-numbered (TSK-001, TSK-002, …). Status starts at Backlog and moves through: Backlog → Planning → In Progress → On Hold → Complete → Cancelled.</P>
              <Tip>Click <strong>From Template</strong> to pre-fill the form from a saved template. Templates appear once an admin or manager has saved at least one.</Tip>
            </Accordion>

            <Accordion title="Visibility control">
              <P>Each task has a <strong>Visibility</strong> setting that controls who can see it:</P>
              <UL items={[
                'Team — visible to everyone with Tasks Hub access (default)',
                'Private — visible only to you. Even admins cannot see private tasks. Enforced server-side.',
                'Shared — visible to you plus specific people you choose (enforced client-side)',
              ]} />
              <P>Assignees always see their tasks regardless of visibility. Cards show a 🔒 icon for private tasks and 👥 for shared tasks.</P>
              <Tip>Use Private for your own to-do items, Shared for tasks you're collaborating on with one other person, and Team for anything the whole staff should see.</Tip>
            </Accordion>

            <Accordion title="Task defaults">
              <P>Click the <strong>⚙ Defaults</strong> button (next to the view toggle) to set your personal defaults for new tasks. You can choose a default visibility and a default share-with list so you don't have to re-select them every time you create a task.</P>
              <Tip>If you almost always share tasks with the same person, save them as your default share-with. They'll be pre-filled whenever you open the New Task form.</Tip>
            </Accordion>

            <Accordion title="Recurring tasks">
              <P>Set a recurrence on any task. When you mark a recurring task <strong>Complete</strong>, the app automatically creates the next task with all the same fields and the next due date calculated forward.</P>
              <Tip>Use recurring tasks for things like weekly bulletin prep, monthly board reports, or quarterly budget reviews.</Tip>
            </Accordion>

            <Accordion title="Checklist items">
              <P>Open a task and scroll to <strong>Checklist</strong>. Type an item and press Enter (or click Add) to add it. Check items off as you work. The card shows your progress (e.g. ✓ 3/5) at a glance. Checklist items carry over when a recurring task auto-creates, with done state reset.</P>
            </Accordion>

            <Accordion title="Task templates">
              <P>Admins and managers can save any task as a template using the <strong>Save as Template</strong> button in the task detail footer. Templates capture name, description, priority, tags, recurrence, assignees, visibility, notes, and checklist (with items reset to unchecked).</P>
              <P>When creating a new task, click <strong>From Template</strong> to pre-fill the form. Templates can be deleted from the template picker by admins and managers.</P>
            </Accordion>

            <Accordion title="Views: Kanban, List, and Calendar">
              <P>Switch between three views using the toggle above the task list:</P>
              <UL items={[
                'Kanban — columns per status; drag cards to change status (desktop)',
                'List — grouped by status with collapsible sections; checkboxes for bulk actions',
                'Calendar — month grid showing tasks on their due dates; click a task chip to open details; mobile shows grouped list (Overdue / This Week / Next 30 Days / Later)',
              ]} />
              <P>Filter by priority, status, assignee, or toggle <strong>My tasks</strong>.</P>
            </Accordion>

            <Accordion title="Bulk actions (list view)">
              <P>In <strong>List</strong> view, check the boxes next to tasks to select them. A blue action bar appears showing how many tasks are selected. From there you can:</P>
              <UL items={[
                'Move selected tasks to any status',
                'Delete selected tasks (admins and managers only)',
                'Select All visible tasks at once',
              ]} />
            </Accordion>

            <Accordion title="CSV export">
              <P>Click <strong>Export CSV</strong> in the toolbar to download the currently filtered tasks as a spreadsheet. The export respects all active filters — so if you filter to "In Progress" tasks, only those are exported.</P>
            </Accordion>

            <Accordion title="Due date email reminders">
              <P>When church email notifications are enabled, assigned team members receive an automatic reminder email each morning for tasks due <strong>today</strong> or <strong>tomorrow</strong>. The email lists all their upcoming tasks with priority and status.</P>
              <Tip>Email notifications are toggled in Coordination Hub → Notification Settings.</Tip>
            </Accordion>

            <Accordion title="Comments and photos">
              <P>Open a task to add comments (real-time thread) and photos. Comments support bullet and numbered lists. You can edit or delete your own comments; admins and managers can edit or delete any comment.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* JOB HUB                              */}
          {/* ──────────────────────────────────── */}
          <Section id="jobs" icon="💼" title="Job Hub" badge="Included in plan">
            <P>A job board where admins post jobs (setup, cleanup, childcare, events, etc.) and members sign up. Supports one-time and recurring series. Includes a Schedule view, Calendar view, and Announcement board.</P>

            <Accordion title="Posting a job" defaultOpen>
              <P>Click <strong>+ Post Job</strong> to create a job listing. Fields include:</P>
              <UL items={[
                'Title and description',
                'Date, start time, and optional end time (leave end time blank for open-ended jobs — they display as just the start)',
                'Location',
                'Spots available — limits how many people can sign up',
                'Pay per person (optional)',
                'Status — Open, Closed, Completed, or Cancelled',
              ]} />
              <P>Jobs are auto-numbered (JOB-001, JOB-002, …). Only admins and managers can post or delete jobs.</P>
              <Tip>Admins can convert a job into a Tasks Hub task (or a task into a job) via the <strong>→ Task</strong> / <strong>→ Job</strong> button in the detail modal — the two stay linked via a backref chip so you can hop between them.</Tip>
            </Accordion>

            <Accordion title="Recurring series 🔁">
              <P>When posting a new job, check <strong>Recurring series</strong> to create multiple jobs at once. Set the frequency and a series end date — a preview shows how many jobs will be created and lists the first several dates (up to 100 jobs).</P>
              <UL items={[
                'Weekly, Every 2 Weeks, Monthly, Quarterly, or Annually',
                'All jobs in the series share the same details but have independent signup lists',
                'Each job gets its own JOB-### number',
                'A 🔁 badge marks recurring jobs on cards and in the schedule',
                'Edit or cancel individual jobs without affecting the rest of the series',
              ]} />
              <Tip>To change an existing series, open any job in it and click <strong>Edit</strong>. The edit form shows a <strong>This job only</strong> / <strong>This + all future jobs</strong> scope toggle, so you can fix one date or update the rest of the run in place — no need to delete and re-post.</Tip>
            </Accordion>

            <Accordion title="Signing up and withdrawing">
              <P>Members can sign up for any open job with spots available. Click <strong>Sign Up</strong> on a job card or in the job detail. Sign-ups are transaction-safe — if the last spot is taken by someone else simultaneously, you'll see a "job is full" message.</P>
              <P>To remove yourself, click <strong>Withdraw</strong>. Admins and managers can also remove individual signups from the job detail view.</P>
              <Tip>Use the <strong>My Jobs</strong> filter tab to see all jobs you've signed up for at a glance.</Tip>
              <Note>If a job has <strong>Required Access Types</strong> set (e.g. background check, SafeGuarding certification), only members linked to a People Access Hub record with those credentials can sign up. Required types show as a 🔒 badge on the job card. Admins set required access types when posting a job; the link between user accounts and People Access records is managed in People Access Hub → person detail → 🔗 Link to user account.</Note>
              <Note>If a job requires a <strong>waiver</strong>, signing up opens a consent window with the full waiver text — you must tick <strong>I have read and agree</strong> before <strong>Agree &amp; Sign Up</strong> becomes available. Your acknowledgement is recorded with the signup.</Note>
            </Accordion>

            <Accordion title="Asking for a swap or replacement">
              <P>Can't make a shift you signed up for? Open the job and click <strong>Request Swap</strong>. Add a short note (e.g. "can't make Sunday — looking for cover") and click <strong>Submit Request</strong>. The request shows up in the job detail under <strong>Swap Requests</strong> for admins and managers, who can dismiss it once you've found your own cover or someone else signs up.</P>
              <Note>Requesting a swap does <em>not</em> withdraw you from the job — until someone actually replaces you, you're still on the roster. If you've decided to bail outright instead of looking for cover, use <strong>Withdraw</strong>.</Note>
            </Accordion>

            <Accordion title="Views: Job Board, Schedule, Calendar, Reports">
              <P>The Job Hub has five tabs (Reports is admin/manager only):</P>
              <UL items={[
                'Job Board — card grid; filter by status or "My Jobs"',
                'Schedule — roster table sorted by date; shows spots filled, status, and (if allowed) who signed up; toggle to show past jobs',
                'Calendar — month grid with job chips per day; color indicates status',
                'Announcements — pinnable posts with optional expiry',
                'Reports — volunteer leaderboard with attendance counts and pay totals (see Attendance + reports below)',
              ]} />
            </Accordion>

            <Accordion title="Exporting and printing">
              <P>On the <strong>Schedule</strong> tab:</P>
              <UL items={[
                'Export My Signups — downloads an iCal (.ics) of just the jobs you’re signed up for; import into Google Calendar, Apple Calendar, or Outlook',
                'Export All (admin/manager) — same idea, but the full church calendar',
                'Print Rosters… (admin/manager) — opens a picker so you can choose which jobs to print sign-in sheets for in one batch',
              ]} />
              <P>From any job's detail modal, admins can also click <strong>🖨 Print Roster</strong> to print that one job's sign-in sheet on its own.</P>
            </Accordion>

            <Accordion title="Attendance + volunteer reports">
              <P>After a job runs, admins and managers open the job detail and mark each signup <strong>Attended</strong> or <strong>No-show</strong> (click again to undo, or leave it blank for signups you didn't track). Attendance is what feeds the Reports leaderboard.</P>
              <P>The <strong>Reports</strong> tab (admin/manager only) shows a per-volunteer leaderboard scoped to the last 30 days, last 90 days, or all time:</P>
              <UL items={[
                'Jobs — total signups in the window',
                'Attended — count of jobs marked Attended (green)',
                'No-show — count of jobs marked No-show (red)',
                'Total pay — sum of pay across attended jobs only',
              ]} />
              <Tip>Marking attendance is optional. If you don't use it, the leaderboard still counts signups — it just won't compute attended/no-show or pay.</Tip>
            </Accordion>

            <Accordion title="Sharing a public job board">
              <P>Admins can share a read-only job board with people who don't have an account. Click <strong>Share Board</strong> in the Job Hub header to copy a public link — anyone with the link sees each open job's title, description, date, time, location, pay, and spot count, and can register to sign up.</P>
              <Note>The shared board is fully public — it is not behind a login. Signup names are never shown, but a job's title, description, and location are. Don't put a minor's name or a private address in those fields. The app warns you before copying the link and when posting a job.</Note>
            </Accordion>

            <Accordion title="Signup roster visibility">
              <P>Admins control who can see the list of names signed up for a job. Go to <strong>Settings → Job Hub Settings → Display Roster To</strong>:</P>
              <UL items={[
                'Admins & Managers only — members only see their own signup status',
                'Anyone signed up for that job (default) — signed-up members can see each other\'s names',
                'All church members — every hub member can see the full roster',
              ]} />
              <P>Spot counts (e.g. "3/5 filled") are always visible to everyone regardless of this setting.</P>
            </Accordion>

            <Accordion title="Email notifications">
              <P>When notifications are enabled in Coordination Hub, Job Hub sends these automatic emails:</P>
              <UL items={[
                'New announcement posted — all Job Hub users are notified',
                'Job cancelled — everyone who signed up receives a cancellation notice',
                'Morning reminder — signed-up members get a reminder email at 8am on the day of the job',
                'Withdrawal notice — when someone withdraws, the job poster (and any delegates) is notified immediately',
                'Co-admin cancellation — if a different admin cancels your job, you receive a notice',
              ]} />
              <P>When cancelling a job with signups, you'll be asked to confirm. If notifications are on, the cancellation email goes to signups automatically. Use the <strong>Notify Signups</strong> button to re-send on an already-cancelled job.</P>
            </Accordion>

            <Accordion title="SMS job texts (reminders & new-shift alerts)">
              <P>Job Hub can text you in two ways — useful when email isn't where you live. You pick either or both: a <strong>shift reminder</strong> the morning of any job you're signed up for, and <strong>new-shift alerts</strong> (a once-daily summary of newly posted shifts at your church). To opt in:</P>
              <UL items={[
                'Verify your email first (Settings shows a banner up top if you haven’t)',
                'In Settings → SMS Job Texts, enter your US/Canada mobile number',
                'Tick "Shift reminders," "New-shift alerts," or both → Save',
              ]} />
              <P>Texts come from the same Twilio number that handles STOP/HELP. Frequency is typically 1–7 per week.</P>
              <Note><strong>To unsubscribe:</strong> reply <strong>STOP</strong> to any reminder text. To turn it back on later, reply <strong>START</strong> from the same number.</Note>
              <Tip><strong>START</strong> only re-enables reminders for numbers that previously opted in here. If you've never opted in on this phone — or you got a recycled number from your carrier — START won't silently turn anything on. You have to opt in via Settings first. That's deliberate: a teen receiving a new phone number shouldn't start getting reminders meant for whoever had it before.</Tip>
            </Accordion>

            <Accordion title="Report delegates">
              <P>Job posters can designate up to 5 other admins or managers to receive the same withdrawal and cancellation notifications they do. Go to <strong>Settings → My Profile → Job Hub Report Delegates</strong> and toggle the users you want to include.</P>
              <P>Delegates receive notifications for all jobs you post — not per-job. Role is re-verified at send time, so demoted users are automatically excluded.</P>
            </Accordion>

            <Accordion title="Announcements">
              <P>Admins and managers can post announcements on the <strong>Announcements</strong> tab. Announcements support:</P>
              <UL items={[
                'Pin — pinned announcements always appear at the top',
                'Expiry date — announcement automatically stops showing after this date',
                'Repeat weekly — bumps the announcement’s date forward seven days each morning so a standing reminder ("Sunday childcare signups open") stays at the top of the list',
              ]} />
              <P>The last 3 active announcements also appear on the main Dashboard for users with Job Hub access.</P>
            </Accordion>
          </Section>

          {/* ──────────────────────────────────── */}
          {/* TEAM HUB                             */}
          {/* ──────────────────────────────────── */}
          <Section id="team" icon="👤" title="Team & Access" badge="Included in plan">
            <P>The free Inventory tier includes up to 10 team members. The <strong>ChurchOpsHub plan ($15/mo or $150/yr)</strong> raises that to <strong>unlimited members</strong> and unlocks every paid feature — with full control over exactly which hubs each person can access.</P>

            <Accordion title="Team members" defaultOpen>
              <UL items={[
                'Free Inventory tier — up to 10 team members',
                'ChurchOpsHub plan — unlimited team members',
              ]} />
              <P>Per-user hub access controls are available on every plan.</P>
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

            <Accordion title="Spaces (rooms you can reserve)">
              <P>The <strong>🏛️ Spaces</strong> card in Settings is where you define the rooms and areas your team can reserve — the Sanctuary, Fellowship Hall, classrooms, and so on. Click <strong>Manage Spaces</strong>, then add each space with a name (required) and optional capacity, location, description, amenities, and a photo. You can also set <strong>approvers</strong> (people who can approve bookings for that space), <strong>blackout dates</strong>, and <strong>weekly blocked hours</strong> (e.g. during the Sunday service). Until at least one space exists, the room option in a reservation shows <em>"No spaces defined yet."</em></P>
              <P>Admins and managers manage the list here; everyone can then reserve those spaces from the <strong>Reservations Hub</strong>. See the <strong>Reservations</strong> help section for booking, times, and conflict checking.</P>
            </Accordion>

            <Accordion title="Church code">
              <P>Your church code is shown in Settings → Church Info. Use the copy button to share it. Admins can change it (requires confirmation) — existing members are unaffected since their profiles already store the church ID.</P>
            </Accordion>

            <Accordion title="Timezone & weekly email digests">
              <P>In <strong>Church Settings</strong>, admins set your church's timezone — all scheduled emails and texts (shift reminders, the new-jobs digest, the weekly task/insights/compliance digests) go out at the right local time. Below it, opt-in <strong>Weekly Email Digest</strong> toggles email admins a Monday-morning recap: <strong>What needs attention this week</strong> (an AI summary across overdue work, expiring compliance, low stock, unfilled shifts, and contractor schedule/payments), plus per-hub <strong>Insights</strong> and <strong>Compliance</strong> digests. Each only sends when there's something to report. The "what needs attention" summary also appears live on the admin Dashboard any time.</P>
            </Accordion>

            <Accordion title="Calendar feed (subscribe in Google Calendar)">
              <P>Admins can generate a read-only <strong>Calendar Feed</strong> link in Settings that shows your church's shifts, reservations, and maintenance in Google Calendar, Apple Calendar, or Outlook. In Google Calendar choose <strong>Other calendars → + → From URL</strong> and paste the link — it updates automatically. The link is private to your church; use <strong>Rotate</strong> to revoke an old one and issue a fresh link.</P>
            </Accordion>

            <Accordion title="Subscription and billing">
              <P>Admins see a <strong>Subscription & Billing</strong> card in Settings. From there:</P>
              <UL items={[
                'Upgrade — opens Stripe checkout to subscribe to the ChurchOpsHub plan ($15/mo or $150/yr)',
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

            <Accordion title="What happens if I cancel?">
              <P>Your plan stays active until the end of your current billing period. After that, the paid hubs show a locked state (🔒) and your data is preserved — it's just inaccessible until you resubscribe. Your free Inventory, supplies, and reservations are unaffected.</P>
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

            <Accordion title="How much does ChurchOpsHub cost?">
              <P>Inventory, supplies, and reservations are <strong>free forever</strong> for up to 10 team members. Everything else — Maintenance, Insights, Coordination, Accountability, People Access, Tasks, and Jobs — is included in one flat <strong>ChurchOpsHub plan: $15/month or $150/year</strong>, with unlimited team members. No per-hub add-ons, no seat tiers. New churches get a 90-day free trial of all paid features.</P>
            </Accordion>

            <Accordion title="What if someone added something to the wrong list — items vs. supplies?">
              <P>Admins can move a record between lists without losing data. Open the supply's Edit modal and click <strong>Move to Inventory →</strong> at the bottom, or open an item's detail modal and click <strong>Move to Supplies →</strong> below the action buttons. Description, location, ministry, and tags carry over automatically — you just fill in the fields that differ between the two lists (Item ID and status for items; Supply ID, quantity, and unit for supplies). The original record is deleted once the new one is created.</P>
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
