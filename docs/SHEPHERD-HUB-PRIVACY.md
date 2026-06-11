# Shepherd Hub — Privacy & Confidentiality (for the elders)

> This is the plain-language promise shown to elders in the app via the
> **🔒 Privacy** link in the Shepherd Hub header. The in-app copy lives in
> `PrivacyModal` in `src/pages/hubs/ShepherdHubPage.jsx` — **keep the two in sync.**
> Reflects the Level-1 privacy model (access rules + app-level audit). Level-2
> client-side encryption was evaluated and **shelved 2026-06-11** (accepted risk;
> see `SHEPHERD-HUB-AUDIT-2026-06-11.md` D5) — do not re-add an "encryption is
> planned" promise unless that decision is reversed.

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
Your private note is protected by access rules — only you can open it through the app. It is **not encrypted in the database**, so a system administrator with direct database access (the person who runs the app) could technically read it. Treat your notes as private *from the church* and well-protected by the app, but not cryptographically sealed.

## What the app records
When you open a person's record or edit a note *in the app*, it records who did it and when — for accountability, not surveillance. Only the administrator can read that log.

## Your responsibility
This is confidential pastoral data, including medical and other sensitive details. Keep it within the eldership. You may export a **contact list** (names and contact info) for your own flock — but never export, screenshot, or forward **notes, medical details, or the full directory**. Sign out on shared devices.

## Access
You're given access when you sign in with your church Google account. When you roll off the eldership, access is removed.

## Questions or concerns
Contact John.
