# Privacy and Under-18 Checklist

This is an operational product checklist, not legal advice. The appropriate University privacy and event contacts must review the final application, OpenAI project arrangement, notices, and booth procedure before public use.

## Architecture-specific warning

The event build has no University-controlled application server. In live mode, the booth browser sends an accepted visitor question, selected evidence, and prompts directly to the OpenAI API using a temporary key stored in `sessionStorage`.

`sessionStorage` limits ordinary persistence to a tab session but is not secure storage and may remain available across reloads or browser recovery. Page scripts, extensions, developer tools, memory inspection, and a person controlling the device may access it. The key must be cleared and revoked after the event.

## Data inventory

Confirm the implementation against this inventory. Any new data item or destination requires renewed review.

| Data | Source | Purpose | Location/destination | Intended lifetime | Persisted by app? |
| --- | --- | --- | --- | --- | --- |
| Temporary API key | Operator | Authorise live API calls | Volatile memory and `sessionStorage` namespace `unimelb-open-day-2026:session-config:v2`; OpenAI request header | Current attended tab/event only | Session-scoped exception |
| Model/reasoning/runtime switches | Operator | Configure the demo | `sessionStorage` | Current tab session | Session-scoped |
| Visitor question | Visitor or fixed chip | Debate topic | Volatile UI state; OpenAI in live mode | Until reset/session completion and provider handling | No persistent app storage |
| Debate transcript/model output | OpenAI or canned package | Visitor experience | Volatile UI state | Until reset/inactivity timeout | No |
| Curated evidence and prompts | Repository | Ground and control the demo | Public static bundle; sent to OpenAI in live mode | Release lifetime/provider handling | Static public content |
| Aggregate operational metrics | Application/operator | Reliability and cost | Volatile UI or approved aggregate record only | Defined by approved runbook | Only if non-identifying and approved |

Prohibited data destinations:

- `localStorage`;
- cookies;
- URLs, fragments, query strings, or browser history;
- GitHub source, Issues, Actions logs, artifacts, or build variables;
- analytics, advertising, session replay, browser fingerprinting, or error-reporting payloads;
- console logs, screenshots, screen recordings, clipboard managers, chat, email, or shared notes;
- a database or persistent transcript store.

## Data minimisation and notice

- [ ] The app asks only for a university/study comparison topic.
- [ ] Free text is limited to 240 characters.
- [ ] The app does not ask for name, age, school, ATAR, address, health, identity, contact details, or other personal information.
- [ ] Six fixed sample chips allow participation without typing.
- [ ] Chips-only mode is available without rebuilding.
- [ ] Canned mode completes the whole experience without an API key or external model processing.
- [ ] The app contains no analytics, advertising, session replay, or browser fingerprinting.
- [ ] Raw visitor text and model output are absent from application logs and operator records.
- [ ] Manual reset and inactivity reset clear all visitor-derived state.
- [ ] Starting a new session cannot reveal content from a previous visitor.

Required visible disclosure:

> **This is an educational AI demo. Do not enter your name, contact details or other personal information. Questions are not saved by this app. AI responses may be wrong.**

- [ ] The disclosure is visible before typing or selecting a question.
- [ ] It remains readable at 1366×768 and 1920×1080.
- [ ] The event UI is English-only; no language selector or partial translation is presented to visitors.
- [ ] Supporting privacy copy explains that accepted live questions are processed by OpenAI directly from the browser.
- [ ] Copy does not claim that `sessionStorage` is secure or that OpenAI retains nothing.
- [ ] Copy does not claim Zero Data Retention unless the actual event project and use have been formally confirmed.

## Local preflight filtering

The following checks must run before any OpenAI call, including moderation or generation calls where applicable.

- [ ] Email addresses are detected and rejected.
- [ ] Phone-number patterns are detected and rejected.
- [ ] URLs are detected and rejected.
- [ ] Obvious street-address patterns are detected and rejected.
- [ ] Long numeric or identifier-like strings are detected and rejected.
- [ ] Personal-data introductions are detected in English, including `my full name is`, `my phone is`, and `I live at`.
- [ ] Chinese equivalents are detected, including phrases that introduce a name, phone number, or home address.
- [ ] Obvious prompt-injection phrases are routed locally without an agent call.
- [ ] Sexual, hateful, violent, self-harm, and personal-crisis input does not enter the debate flow.
- [ ] Off-topic questions are handled locally or through approved canned content.
- [ ] Input is normalised and handled as untrusted text, never rendered as HTML.
- [ ] Tests include combined and obfuscated patterns, not only exact examples.

Local filtering reduces accidental transfer but cannot guarantee detection of all personal information. Staff supervision and chips-only fallback remain required controls.

## Under-18 operating model

- [ ] The event organiser confirms the expected audience and supervision model.
- [ ] Free text is labelled for visitors aged 13+ unless the University approves a different arrangement.
- [ ] Visitors under 13 use predefined sample chips with a parent, guardian, or facilitator unless an approved alternative is documented.
- [ ] Staff never ask a visitor to state or type their age, school, contact details, admissions score, identity, or health information.
- [ ] Staff actively stop personal-information entry and can press Reset immediately.
- [ ] Chips-only mode is used when queues, supervision, or audience age make free text unsuitable.
- [ ] The demo does not provide counselling, crisis handling, admissions decisions, or personalised legal/financial/health advice.
- [ ] A distressed visitor is referred to booth staff and the University's approved on-site support process rather than an AI conversation.

Zero Data Retention, if desired, is an account/project and contractual operating condition, not a frontend feature. Record the evidence for the actual event arrangement:

| Item | Owner | Status | Evidence/date |
| --- | --- | --- | --- |
| OpenAI project identified |  | Pending |  |
| Current data controls/retention reviewed |  | Pending |  |
| ZDR eligibility and endpoint compatibility confirmed, if claimed |  | Pending / Not claimed |  |
| University privacy approval recorded |  | Pending |  |
| Final free-text age rule approved |  | Pending |  |

## API-key privacy and security controls

- [ ] The event uses a dedicated key, not a personal or long-lived key.
- [ ] The key is created shortly before use and revoked immediately after use.
- [ ] The OpenAI project uses the narrowest practical access, model, usage, and rate controls.
- [ ] The key field is masked by default.
- [ ] Live mode requires explicit acknowledgement that the key is exposed to browser code.
- [ ] The key is never displayed after save.
- [ ] The key is never included in logs, errors, telemetry, URLs, screenshots, tests, fixtures, or GitHub Actions.
- [ ] **Clear key** removes storage and in-memory references immediately and returns the demo to canned mode.
- [ ] Closing or refreshing the browser is not treated as erasure.
- [ ] An authenticated custodian can revoke the key from a separate device at any time.
- [ ] Aggregate project usage is monitored during the event.
- [ ] The browser uses a clean profile with unnecessary extensions, sync, autofill, password saving, and session restore disabled.

## Browser and application behaviour

- [ ] No service worker, cache, state library, or error boundary persists visitor content or the key outside the documented namespace.
- [ ] React/component state is cleared on manual reset, inactivity reset, mode change, key clear, and session replacement.
- [ ] In-flight requests are aborted when the session resets or key is cleared.
- [ ] Stale responses cannot repopulate the interface after reset.
- [ ] Error messages contain a safe error code, not raw request bodies, headers, questions, prompts, model output, or credentials.
- [ ] The application never uses `dangerouslySetInnerHTML` for visitor or model text.
- [ ] Evidence links cannot navigate the kiosk away from the app in visitor mode.
- [ ] Browser developer tools remain closed while a key is active.
- [ ] Browser crash/session recovery is tested and followed by explicit clear/revoke procedures.

## Live-mode provider review

Before the event, the privacy/API owners must review the current official terms and actual project configuration for:

- [ ] API data use and retention;
- [ ] geographic and organisational requirements;
- [ ] endpoint and feature compatibility with the approved data controls;
- [ ] access controls and audit visibility;
- [ ] incident and deletion/contact procedures;
- [ ] any University procurement, contract, or records obligations.

Do not rely on repository documentation as evidence of provider-side configuration.

## Operational checklist

### Before doors open

- [ ] Clear all previous browser/site data.
- [ ] Complete one canned rehearsal before configuring a key.
- [ ] Verify PII and prompt-injection samples are blocked locally.
- [ ] Enter the event key privately and accept the warning.
- [ ] Run an approved sample-chip live flow.
- [ ] Reset to a pristine attract screen.
- [ ] Confirm the privacy contact and key custodian are reachable.

### During the event

- [ ] Keep the laptop attended.
- [ ] Encourage chips and repeat the no-personal-information reminder.
- [ ] Reset immediately after accidental personal-information entry.
- [ ] Switch to chips-only if filters or supervision are insufficient.
- [ ] Record only aggregate metrics and non-identifying incident categories.
- [ ] Never ask a visitor to repeat problematic input for diagnosis.

### After the event

- [ ] Select **Clear key** and confirm canned mode.
- [ ] Close all tabs and clear site data.
- [ ] Revoke the key in the OpenAI project and record the revocation time without the secret.
- [ ] Review aggregate usage for anomalies.
- [ ] Remove or disable the public Pages deployment if no longer needed.
- [ ] Follow University incident procedures for any suspected data or credential exposure.
- [ ] Retain only approved aggregate operational records and approval evidence.

## Incident handling

If personal data may have reached OpenAI:

1. Reset the app and stop additional transfer.
2. Do not copy the visitor text into notes, chat, email, an Issue, or a screenshot.
3. Switch to chips-only or canned mode.
4. Notify the designated privacy contact through the approved University process.
5. Record only the minimum non-identifying facts needed for triage.

If the key may be exposed:

1. Clear it from the setup UI.
2. Revoke it in the OpenAI project immediately.
3. Switch to canned mode.
4. Review aggregate usage and notify the designated security contact.
5. Do not create a replacement until the exposure path is understood.

See [Open Day Operations Runbook](OPEN_DAY_RUNBOOK.md) for full response steps.

## Verification evidence

| Control | Test/review evidence | Owner | Status | Date |
| --- | --- | --- | --- | --- |
| PII/injection preflight |  |  | Pending |  |
| No persistent raw content |  |  | Pending |  |
| Reset and stale-response isolation |  |  | Pending |  |
| Key clear and canned fallback |  |  | Pending |  |
| No secret in source/build/workflow |  |  | Pending |  |
| 13+ and chips-only UI |  |  | Pending |  |
| Provider/project review |  |  | Pending |  |
| Privacy notice approval |  |  | Pending |  |

No blank or `Pending` row should be interpreted as approval.
