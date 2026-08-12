# Open Day Operations Runbook

This runbook is for the attended, one-day GitHub Pages deployment of **Trust the Verdict? — Three AIs. One hidden instruction.** It assumes that the booth browser may temporarily hold an event-specific OpenAI API key in `sessionStorage`.

That key arrangement is a high-risk exception, not a recommended production architecture. The operator must understand [Architecture Deviations](ARCHITECTURE_DEVIATIONS.md) and [Threat Model](THREAT_MODEL.md) before enabling live mode.

## Roles

Assign named people before the event. One person may hold multiple roles, but ownership must be explicit.

| Role | Responsibility | Assigned person |
| --- | --- | --- |
| Demo owner | Go/no-go decision and escalation |  |
| Kiosk operator | Setup, visitor supervision, reset, mode switches |  |
| API-key custodian | Create, restrict, monitor, and revoke the event key |  |
| Content/brand approver | Evidence, comparator, copy, and assets |  |
| Privacy contact | Collection notice and under-18 arrangement |  |
| Technical backup | Deployment, network, browser, and fallback recovery |  |

## Release gates

Do not use live mode publicly until every gate is complete.

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` pass on the release commit.
- [ ] `pnpm build:pages` produces `out/` without an embedded API key or unrelated private data.
- [ ] The GitHub Pages deployment workflow passes for the release commit.
- [ ] The final Pages URL is tested on the actual school laptop and event network.
- [ ] Both target viewports, keyboard controls, reduced motion, full-screen mode, and reset are verified.
- [ ] Canned mode completes the full compromised → X-Ray → clean re-check narrative with no key.
- [ ] Live mode completes the same narrative with the event key.
- [ ] Content, comparator, brand, privacy, under-18, and accessibility approvals are recorded.
- [ ] The named comparator and branded-assets switches match their approval status.
- [ ] The API-key custodian accepts the browser-key risk and has immediate project access to revoke the key.
- [ ] A printed or offline explanation is ready if the application cannot be used.

## One week before

### Content and policy

- [ ] Review every evidence URL against the current official source.
- [ ] Remove stale, ambiguous, or no-longer-public facts.
- [ ] Confirm every displayed evidence item is marked safe for public comparison.
- [ ] Review English and Chinese canned packages for factual parity and respectful tone.
- [ ] Confirm the compromised verdict acknowledges a comparator strength and makes no absolute claim.
- [ ] Confirm the X-Ray always reveals the exact demo-only compromised policy.
- [ ] Confirm the clean verifier permits either institution, `tie`, or `depends`.
- [ ] Complete [Content and Brand Approval](CONTENT_AND_BRAND_APPROVAL.md).
- [ ] Complete [Privacy and Under-18 Checklist](PRIVACY_AND_UNDER_18_CHECKLIST.md).

### API project and key plan

- [ ] Use a dedicated OpenAI project for the event where administratively possible.
- [ ] Give access only to staff who need it.
- [ ] Configure the narrowest available permissions, model access, usage controls, alerts, and rate limits that still support the demo.
- [ ] Record the key name or identifier, project, custodian, planned creation time, and planned revocation time. Never record the secret value.
- [ ] Confirm the custodian can revoke the key from a separate authenticated device during the event.
- [ ] Do not create the final event key yet if a short pre-event lifetime is practical. Use a separate development key for rehearsal and revoke it afterward.
- [ ] Confirm any Zero Data Retention or other data-control claim with the University privacy contact and the actual OpenAI project configuration. Do not infer it from application code.

### Hardware and network

- [ ] Test the exact school laptop, display, adapter, charger, pointer, keyboard, and hotspot.
- [ ] Confirm the event network permits the final GitHub Pages URL and direct browser HTTPS requests to the OpenAI API.
- [ ] Test the browser's direct API flow under the same filtering, proxy, VPN, and TLS inspection expected on the day.
- [ ] Prepare a clean local browser profile with sync, autofill, password saving, session restore, and unnecessary extensions disabled.
- [ ] Disable notifications, sleep, screensaver, automatic updates, and disruptive power-saving behaviour for the event window.
- [ ] Confirm full-screen exit controls remain known to staff.

## Day before

From a clean checkout of the release commit:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm build:pages
```

Then:

- [ ] Review command results rather than assuming a zero exit code covers all release requirements.
- [ ] Search `out/` for API-key prefixes, test secrets, private URLs, personal data, and source maps not intended for release.
- [ ] Deploy through `.github/workflows/deploy-pages.yml`.
- [ ] Record the deployed commit SHA and final Pages URL.
- [ ] Open the final URL and check that all scripts, fonts, images, and navigation load under the repository base path.
- [ ] Run one full canned session at 1920×1080 and one at 1366×768.
- [ ] Confirm there is no horizontal or unwanted page scrolling at 100% zoom.
- [ ] Confirm page refresh and direct navigation work at the Pages URL.
- [ ] Confirm the setup panel contains no prefilled or cached key.
- [ ] Confirm **Clear key** immediately shows canned mode.
- [ ] Confirm reset removes the visitor question, transcript, verdicts, and derived output.
- [ ] Confirm a second visitor cannot see the previous visitor's content.
- [ ] Confirm common PII, unsafe-content, off-topic, and prompt-injection examples are blocked before a live call.
- [ ] Confirm no analytics, error tracker, or console logging records raw visitor text or credentials.
- [ ] Pack a printed facilitator script and a one-page manual version of the security lesson.

## Event morning

### 1. Physical and browser preparation

1. Connect the laptop to power and the final display.
2. Connect the primary network and verify the backup hotspot.
3. Start the dedicated browser profile.
4. Clear history, site data, autofill, downloads, and any previous demo session.
5. Open the final GitHub Pages URL in one tab only.
6. Leave developer tools closed while a key is present.
7. Keep the browser window attended from this point onward.

### 2. Canned rehearsal

1. Open **Setup**.
2. Verify the key field is empty and mode is **Canned**.
3. Select the final comparator, language, free-text, and compromised/fair switches.
4. Save, run a sample chip, and watch the entire narrative.
5. Verify X-Ray wording, clean re-check, final takeaway, and auto-reset.

If canned mode fails, do not proceed to live mode. Use the printed explanation until the release is repaired and re-verified.

### 3. Create and restrict the event key

The API-key custodian should:

1. Create a new key dedicated to this event.
2. Apply the narrowest permissions and usage controls available for the required Responses API flow.
3. Confirm usage alerts and the revocation path.
4. Transfer the key directly into the setup field without chat, email, shared notes, screenshots, clipboard managers, shell history, or source files.
5. Avoid reading the key aloud or displaying it to visitors.

The key has no automatic safety merely because it is short-lived. Manual revocation after the event is mandatory.

### 4. Configure live mode

1. Open **Setup**.
2. Paste the key into the masked field.
3. Read and accept the client-side key risk acknowledgement.
4. Confirm the role configuration:
   - advocates: `gpt-5.6-luna`, reasoning `none` by default;
   - compromised verifier: `gpt-5.6-terra`, reasoning `low` by default;
   - clean verifier pair: `gpt-5.6-terra`, reasoning `low` by default.
5. Confirm each selected reasoning effort is supported by its model.
6. Select **Live** and save the tab-scoped configuration.
7. Run one sample question and one approved free-text question.
8. Confirm model failures recover into the canned flow without leaking the key or raw error details.
9. Confirm the API project shows only the expected event activity.

### 5. Enter kiosk state

- [ ] Return to the attract screen with no previous visitor content.
- [ ] Set browser zoom to 100% and enter full screen.
- [ ] Verify the visible privacy disclosure.
- [ ] Keep **Setup** and **Reset** accessible to the operator.
- [ ] Place the operator where they can stop personal-information entry and respond immediately.
- [ ] Record the opening time; do not record visitor questions.

## During the event

### Normal operation

- Keep the laptop and active tab attended.
- Encourage sample chips, especially during queues.
- Remind visitors not to enter names, contact details, or other personal information.
- Use chips-only mode for visitors under 13 unless an approved alternative arrangement is in place.
- Watch each compromised session through the X-Ray and clean re-check. Reset any session that does not reveal the manipulation.
- Check only aggregate API usage, latency, fallback rate, and error category. Do not record raw questions or model output.
- Periodically run a canned sample to ensure fallback remains available.
- Do not open developer tools, browser settings, password managers, or unrelated sites while the key is present.

### Facilitator script

Opening:

> Ask the two university AIs any comparison question. They will debate, and a third AI will verify the facts and choose a winner.

After the first verdict:

> That sounded confident—and many of the facts were supported. But should we trust the decision?

During the reveal:

> The judge had a hidden privileged instruction telling it to recommend Melbourne. It did not need to tell an obvious lie; it could simply change how it weighted the same facts.

During the clean re-check:

> Now we keep the debate and evidence unchanged, remove the compromised policy, reverse the order of the candidates and judge it again.

Closing:

> Adding more AI agents is not enough. We also need to protect their prompts, objectives, evidence and decision process.

## Incident and fallback procedures

### Suspected key exposure

Examples include an unmasked field, open developer tools, suspicious extension activity, accidental paste, screenshot, unexpected usage, or a visitor gaining device access.

1. Select **Clear key** immediately.
2. Switch to canned mode.
3. Revoke the key in the OpenAI project immediately; closing the browser is not sufficient.
4. Confirm no further usage occurs.
5. Notify the demo owner and follow the University's security incident process.
6. Do not copy the exposed key into an incident note.
7. Create a replacement only after the exposure path is understood and the demo owner approves resuming live mode.

### Visitor enters personal or sensitive information

1. Press **Reset** immediately.
2. Do not repeat, photograph, transcribe, or include the text in a report.
3. Switch to chips-only mode if supervision or filtering is insufficient.
4. If the text may have reached the API, notify the privacy contact using the approved incident process without reproducing the content unnecessarily.
5. Use aggregate incident categories only, such as `PII_FILTER_MISS`.

### Unsafe, distressing, or inappropriate input/output

1. Reset the display and do not continue the debate.
2. Direct a visitor in distress to booth staff and the appropriate on-site support process; the demo is not a support service.
3. Switch to chips-only or canned mode.
4. Record only the error category needed for review.

### Network, API, quota, latency, or model failure

1. Switch to canned mode; do not repeatedly retry a failing live request.
2. Check the aggregate health indicator and project usage from an operator device.
3. Use the backup network only if it was pre-approved and tested.
4. Keep the visitor-facing narrative moving with canned content.
5. Do not expose raw API errors or credentials while troubleshooting.

### Deployment or integrity concern

Examples include an unexpected prompt hash, unfamiliar UI, failed GitHub workflow, changed release SHA, or suspected repository compromise.

1. Stop using the site, including canned mode, because the static bundle itself may be untrusted.
2. Clear and revoke the key.
3. Use the printed explanation.
4. Compare the deployed workflow and commit with the recorded release.
5. Resume only after a clean rebuild, deployment, and release-gate review.

### Content or brand concern

1. Switch to the generic comparator and unbranded text/letter-avatar mode.
2. Use chips-only/canned content already approved.
3. Escalate to the content/brand approver before restoring the questioned material.

## End-of-day shutdown

Perform these steps even if the event will continue another day. Use a newly approved key for each event day where practical.

1. Stop visitor access and exit full screen.
2. Open **Setup** and select **Clear key**.
3. Confirm the interface reports canned mode and an empty key field.
4. Close every tab and the dedicated browser profile.
5. Revoke the event key in the OpenAI project.
6. Confirm revocation and review aggregate usage for anomalies.
7. Record revocation time, key identifier, final aggregate usage, fallback count, and incident categories. Never record visitor text or the secret.
8. Clear browser site data and disable session restore.
9. Restore laptop sleep, update, notification, and network settings.
10. If the public demo is finished, disable GitHub Pages or remove the deployment according to the repository owner's retention plan.
11. Notify the demo owner that key revocation and kiosk cleanup are complete.

## Post-event review

- [ ] Confirm no active event key remains.
- [ ] Confirm the public Pages deployment has the intended post-event state.
- [ ] Review aggregate usage and errors without raw content.
- [ ] Document incidents, false positives, fallbacks, and visitor comprehension at a non-identifying level.
- [ ] Revalidate or remove evidence before any reuse.
- [ ] Reassess the architecture. Any reuse beyond the attended event should move API calls to a trusted server-side boundary.
- [ ] Archive approval records and the release commit SHA according to University requirements.
