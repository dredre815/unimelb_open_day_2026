# Demo Design System

This file converts the approved visual concepts into the implementation contract for the kiosk UI.

## Concept sources

- `docs/design/concepts/attract-screen.png` — idle/attract state, native size 1672x941.
- `docs/design/concepts/debate-xray-screen.png` — debate, compromised verdict, X-Ray, and clean re-check state, native size 1672x941.
- `docs/design/concepts/session-setup-screen.png` — operator setup state, native size 1672x941.

The concepts are layout and styling references. Interactive text, controls, evidence, prompts, and verdicts remain code-native. The implementation must use the exact product copy and evidence data even if generated concept text differs.

## Visual direction

- Theme: premium cybersecurity control room crossed with a messaging interface.
- Background: true dark navy, never cream or warm black.
- Composition: open full-screen bands and rails; avoid nested card grids.
- Primary focal motif: three connected agent nodes and one horizontal verifier rail.
- Density: medium on active screens, low on the attract screen.
- Motion: travelling connection trace, status-ring pulse, message entrance, localised failure glitch, and stable clean-verifier shield.

## Tokens

| Token | Value | Purpose |
| --- | --- | --- |
| `--background` | `#020817` | Page background |
| `--surface` | `#07162d` | Main panels |
| `--surface-raised` | `#0b1d39` | Controls and transcript rows |
| `--line` | `#1b365b` | Neutral border |
| `--line-bright` | `#2f91ff` | Active border |
| `--primary` | `#1478ff` | Primary action and UniMelb state |
| `--cyan` | `#56d8ff` | Network and verifier activity |
| `--comparator` | `#9b70ff` | Comparator identity only |
| `--failure` | `#ff5e62` | Integrity failure |
| `--warning` | `#f5b82e` | Client-key warning |
| `--verified` | `#55dfbd` | Clean re-check |
| `--text` | `#f7fbff` | Primary text |
| `--muted` | `#9db0ca` | Secondary text |
| `--radius-sm` | `10px` | Chips and compact controls |
| `--radius-md` | `14px` | Rows and message bubbles |
| `--radius-lg` | `20px` | Major surfaces |

Spacing uses a 4px base with primary steps of 8, 12, 16, 24, 32, and 48px. Major kiosk gutters are 28-32px at 1920x1080 and 16-20px at 1366x768.

## Typography

- Display: Space Grotesk Variable, 650-700 weight.
- UI and content: Inter Variable, 400-700 weight.
- Attract title: clamp from 52px at 1366px to 88px at 1920px.
- Screen heading: 28-36px.
- Transcript and verdict body: 18-24px depending on viewport height.
- Control text: 15-18px, explicitly set on every control.
- Caption/disclosure: 14-16px with at least 1.4 line height.

## Container model

- App shell: fixed viewport-height canvas with a quiet header.
- Attract state: open central stage, one question-chip rail, one composer rail.
- Debate state: two narrow advocate rails around a wide transcript, followed by one verifier/X-Ray rail.
- Setup state: one full-width configuration surface with bands and table-like rows.
- Tablet fallback: agent summaries become a two-column row above the transcript; verifier rail stays visible below it.

## Component families

- `KioskHeader`: title, phase, integrity state, setup/reset actions.
- `AgentNode`: letter/shield avatar, status ring, role, evidence list.
- `ConnectionField`: decorative SVG paths with reduced-motion fallback.
- `QuestionComposer`: sample chips, free-text input, disclosure, primary action.
- `Transcript`: visitor question and four attributed debate messages.
- `VerifierRail`: compromised verdict, evidence summary, integrity result, X-Ray diff, and clean order test.
- `SetupPanel`: temporary key controls, agent configuration rows, global runtime switches, save action.
- `SourceDrawer`: in-app evidence details; never navigates the kiosk away.
- `FinalTakeaway`: final fair verdict and security lesson.

## Icon inventory

Use a single rounded outline family with approximately 1.75-2px stroke: settings, reset, shield, fingerprint/search, eye/eye-off, trash, connection, message, check, failure, warning, arrow-right, external-link, and close. Letter avatars are code-native text, not generated brand marks.

## Copy lock

Attract-screen copy is limited to:

- `University of Melbourne`
- `TRUST THE VERDICT?`
- `Three AIs. One hidden instruction.`
- `Setup`
- `Ready` or an equivalent real connection state
- The six specified university-comparison sample questions
- `Start Debate`
- `Educational AI demo. Please do not enter personal information.`

The X-Ray must include:

- `Facts checked`
- `Policy integrity: FAILED`
- `The debate did not change. The hidden objective did.`
- `DEMO-ONLY COMPROMISED POLICY`
- `Clean re-checking the unchanged debate...`

Do not add a hero eyebrow, promotional badge, fake metric, ranking, ATAR, fee, salary, employment rate, guarantee, or unsupported university claim.

## Setup behaviour

- Model choices: `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`.
- Reasoning choices: `none`, `low`, `medium`, `high`, `xhigh`, `max`.
- Default advocates: Luna / none.
- Default compromised and clean verifiers: Terra / low.
- The API key field is masked by default and requires explicit client-side risk acknowledgement before live mode can be saved.
- Key and runtime settings use `sessionStorage`; never `localStorage`, a URL, telemetry, logs, source files, or rendered debug output.
- Clearing the key immediately returns the session to canned mode.

## Responsive and accessibility rules

- Primary targets: 1920x1080 and 1366x768 at 100% zoom.
- No horizontal page scrolling at either target.
- Every interactive target is at least 44x44px.
- Status always has text in addition to colour.
- Focus indication is a visible cyan/white ring.
- Phase changes use a polite live region.
- Reduced-motion mode removes travelling/pulsing transforms and retains opacity plus text changes.

## Intentional architecture deviation

The master specification assumes a local Next.js server and a server-only API key. The deployment requested for this build is a static GitHub Pages export with a temporary browser key stored in `sessionStorage`. This is a higher-risk, event-only exception: the key remains readable by page scripts, browser tooling, and extensions. The setup UI must say so plainly and require a restricted, short-lived project key. No code should describe this arrangement as secure.
