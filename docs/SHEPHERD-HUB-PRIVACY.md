# Shepherd Hub — Privacy & Confidentiality (for the elders)

> This is the plain-language promise shown to elders in the app via the
> **🔒 Privacy** link in the Shepherd Hub header. The in-app copy lives in
> `PrivacyModal` in `src/pages/hubs/ShepherdHubPage.jsx` — **keep the two in sync.**
> Reflects the Level-1 privacy model (rules + audit, not yet encrypted); update
> the "honest limit" section when Level-2 client-side encryption ships.

This hub holds confidential pastoral information. Please read how it's protected — and what's expected of you.

## What this is
A private, always-current view of our congregation, drawn from Planning Center, so you can shepherd the people in your care and keep your own notes.

## Where the data comes from
People and contact details sync **read-only** from Planning Center (the church's system of record). The hub never changes Planning Center — with one exception you control: reassigning who shepherds someone writes that one field back, so the assignment stays accurate everywhere.

## Who can see what
- **Your private note** on a person — **only you.** No other elder, and not the administrator, can read it through the app.
- **The shared care thread** — every elder can read it and add to it.
- **The directory, contact info, and medical notes** — elders and John (administrator) only. No other staff or members.

## The honest limit
Notes are protected by access rules and every view and edit is logged. But they are **not yet end-to-end encrypted** — a system administrator with direct database access could technically read them. Encryption that seals notes even from administrators is planned. Until then: treat this as private *from the church* and well-protected, but not cryptographically sealed.

## Everything is logged
Opening a person's record or editing a note records who did it and when. This is for accountability, not surveillance — it protects everyone.

## Your responsibility
This is confidential pastoral data, including medical and other sensitive details. Keep it within the eldership. Don't export, screenshot, or forward it. Sign out on shared devices.

## Access
You're given access when you sign in with your church Google account. When you roll off the eldership, access is removed.

## Questions or concerns
Contact John.
