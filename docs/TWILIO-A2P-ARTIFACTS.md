# Twilio A2P Campaign Artifacts

_Moved from Claude memory 2026-07-04. Re-paste these into Twilio if the A2P campaign is ever rejected/re-reviewed._
ChurchOpsHub Twilio A2P 10DLC registration submitted 2026-04-27. Brand registered 2026-04-26; Campaign submitted 2026-04-27 with use case **Low Volume Mixed**.

**Why Low Volume Mixed (not Account Notifications)**: ChurchOpsHub today sends only job-shift reminders, but the roadmap likely adds task due-date reminders too. Low Volume Mixed allows multiple notification types under one campaign without re-registering. LV throughput tier matches our scale (a single church sending ~5 SMS per job per week).

**How to apply**: If Twilio rejects the campaign and requests revisions, re-paste these exact values rather than redrafting. They were derived from the actual production SMS template at `functions/index.js:1113-1115` and the legal pages at `?terms` and `?privacy`.

---

### Campaign description

```
ChurchOpsHub sends job-shift reminder SMS messages to church volunteers and members who have explicitly opted in via the app's Settings page. Members enter their phone number, check "Enable SMS reminders," and accept a TCPA consent disclosure before any messages are sent. Reminders are sent the morning of a scheduled volunteer shift (1-5 messages per week per user). Reply STOP at any time to unsubscribe; reply HELP for support contact information.
```

### Sample message #1 (single-job reminder — most common)

```
ChurchOpsHub: Reminder — you're signed up for "Sunday Service Setup" today at 7:30 AM @ Main Sanctuary. Reply STOP to opt out.
```

### Sample message #2 (multi-job same-day)

```
ChurchOpsHub: Reminder — you have 2 jobs today:
• Sunday Service Setup at 7:30 AM — Main Sanctuary
• Coffee Hour Cleanup at 11:00 AM — Fellowship Hall

Reply STOP to opt out.
```

### Sample message #3 (HELP reply — optional)

```
ChurchOpsHub: For help, contact your church admin or email support@churchopshub.com. Reply STOP to opt out.
```

### Campaign description — 2026-05-19 corrected version (paste into Twilio Console "Campaign description")

```
ChurchOpsHub is a web platform that helps churches manage volunteer job shifts. This campaign sends SMS reminders to volunteers the morning of a shift they personally signed up for (typically 1-5 messages per week). Volunteers opt in by entering their own mobile number and checking an unchecked-by-default consent box in the app. The complete opt-in consent form and program disclosure are publicly viewable WITHOUT any login or account at https://churchopshub.com/sms-program, which shows a screenshot of the exact in-app consent form and the verbatim consent language. Reply STOP to unsubscribe; reply HELP for help.
```

### Message flow / "How do end-users consent to receive messages?" — 2026-05-19 corrected version

```
Consumers opt in to ChurchOpsHub SMS job-shift reminders by submitting their own mobile number through a consent form inside the ChurchOpsHub web application. The exact opt-in consent form and the complete program disclosure are PUBLICLY VIEWABLE WITHOUT ANY LOGIN OR ACCOUNT at https://churchopshub.com/sms-program — that page displays a screenshot of the exact in-app opt-in form, the verbatim consent language, sample messages, message frequency, the sending number, and opt-out/HELP instructions.

Opt-in description: Inside the ChurchOpsHub web app the user opens Settings, then the "My Profile" section, then "SMS Job Reminders". The user types their own mobile phone number into the phone field and reads the consent disclosure shown directly beneath it. The "Enable SMS reminders" checkbox is unchecked by default and only becomes active after the user has entered their own number. The user checks "Enable SMS reminders" and clicks Save. A number receives messages only after the user personally completes this form. There is no other opt-in path: phone numbers are never uploaded, purchased, or added by an administrator, and consent is never pre-checked.

Exact consent disclosure shown on the form before consent is given: "By providing your phone number and enabling SMS reminders, you consent to receive automated text messages from ChurchOpsHub for job-shift reminders. US and Canada numbers only. Message and data rates may apply. Message frequency varies (typically 1-5 messages per week). Reply STOP to unsubscribe or HELP for help."

Opt-out: reply STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, or QUIT to any message, or clear the phone number / uncheck the box in Settings. HELP: reply HELP or INFO to any message, or email churchopshub@gmail.com. Privacy Policy: https://churchopshub.com/privacy . Terms of Service: https://churchopshub.com/terms .
```

### Consent / opt-in description (40-2048 chars) — DEPRECATED 5/14 version retained below for reference only

```
End users opt in to ChurchOpsHub SMS reminders through the web application at https://churchopshub.com. After signing in, the user navigates to Settings → My Profile → SMS Reminders, enters their mobile phone number, checks the box labeled "Enable SMS reminders," and clicks Save. Before the checkbox is enabled, the form displays the following consent disclosure: "By providing your phone number and enabling SMS reminders, you consent to receive automated text messages from ChurchOpsHub for job-shift reminders. Message and data rates may apply. Message frequency varies (typically 1-5 messages per week). Reply STOP to unsubscribe or HELP for help."

This is the only opt-in path; messages are not sent to any number that has not completed this in-app consent flow. The full SMS program terms (program name, frequency, rates, HELP/STOP keywords, support contact, sending number) are published at https://churchopshub.com/?terms in Section 7. Users can revoke consent at any time by clearing their phone number in Settings or by replying STOP to any message.
```

### Privacy Policy URL

```
https://churchopshub.com/?privacy
```

### Terms and Conditions URL

```
https://churchopshub.com/?terms
```

### Twilio SIDs and program status (visible in Twilio Console — not secret, useful for cross-reference)

- Twilio Console login email: `jcvaught@gmail.com`
- Account SID: `AC…` (redacted — see Twilio Console)
- TrustHub Business Profile / Bundle SID: `BU99f73c04fee0f43472f86f6bdd2a77fb` (**approved 2026-04-27**)
- Brand SID: `BN26d4c05c3cd2a5882603d7f2bb8ef015` (**registered 2026-04-26**)
- Campaign SID (original, REJECTED 2026-05-14): `CM1c503f6147a2db830f01704` (memory claimed it was DELETED via API; that was wrong — API DELETE is unsupported. It was probably superseded by the 5/14 resubmit via Console.)
- Campaign SID (current, resubmitted via Console "Fix Campaign" 2026-05-19): `CM57da3c4d828884b7d8a66f30ac1955b7` (status: IN_PROGRESS, TCR re-review pending — corrected Campaign description + message_flow + Privacy/Terms URLs)
- Compliance bundle SID (reused across delete/recreate): `QE2c6890da8086d771620e9b13fadeba0b`
- Messaging Service SID: `MGb4f2156d4ab3104ee564f15...` (truncated, auto-created with campaign)
- **Twilio.org Impact Access**: approved 2026-04-27 for Fairfax Church of Christ — $100 nonprofit product credit + discounted A2P pricing applied to this Account SID

### Phone number / Messaging Service binding (as of 2026-04-28)

- `+1 571-540-7100` is configured as a **bare account-level phone number** — not attached to either Messaging Service. Outbound sends in `functions/index.js` use `TWILIO_FROM` (the bare number) directly, not a Messaging Service SID.
- There are **two Messaging Services** auto-created during A2P registration, both named "Low Volume Mixed A2P Messaging Service" with empty sender pools: `MG45293bc76c21346ac47e5326ce1b7df6` and `MGb4f2156d4ab3104ee564f15cb701d81d`. Unclear which is the live campaign-linked one. Worth cleaning up after A2P approval.
- **twilioInbound webhook** is configured directly on the phone number's "A message comes in" → Webhook setting (URL: `https://us-central1-church-inventory-9615c.cloudfunctions.net/twilioInbound`, HTTP POST). Not on either Messaging Service. **This binding can silently disappear** — happened between 2026-05-12 and 2026-05-14. Symptom: Programmable Messaging Logs show inbound as "Received" but Message Detail shows "There were no HTTP Requests logged for this event" + Messaging Service = "–". Fix: re-set the webhook URL on the phone number's Messaging Configuration in Twilio Console.
- **TODO post-A2P-approval**: once campaign is approved, migrate the bare number into the campaign's Messaging Service and switch outbound sends to use `messagingServiceSid` instead of `from: TWILIO_FROM`. Required for proper A2P 10DLC throughput allocation. Until then, sends route as unregistered traffic and may be filtered by carriers.
