# Project Instructions

These instructions apply to all repository work. Explicit user instructions and platform safety requirements take precedence.

## Specification and scope

- Read `unimelb_open_day_mas_demo_codex_master_prompt.md` and `unimelb_open_day_mas_demo_development_manual.md` before changing product behaviour.
- Treat the development manual as normative when it differs from the master prompt.
- Treat `docs/ARCHITECTURE_DEVIATIONS.md` as the explicit exception register. The event-only static GitHub Pages topology and browser-provided key override the original server architecture only where the register says so.
- Do not silently widen an exception. Record any new architectural deviation, risk, owner, and approval requirement before implementing it.
- Keep the application a focused one-day educational demo. Do not add accounts, databases, tracking, live search, agent frameworks, voice input, or persistent conversation history.

## Engineering approach

- Use English for code, identifiers, comments, tests, documentation, UI copy, logs, commit messages, and pull request text.
- Prefer the smallest direct TypeScript/React implementation that satisfies the specification.
- Match existing patterns and avoid unrelated refactors or dependency updates.
- Use strict TypeScript and Zod validation at every model-output boundary.
- Keep independent advocate calls and clean order-reversed verifier calls parallel.
- Set `store: false` for every OpenAI Responses API call.
- Never request, store, infer, or display chain-of-thought. Show concise public reasoning only.
- Validate model-generated evidence IDs against the exact supplied evidence set before display.
- Keep canned fallback packages behaviourally equivalent to live mode.

## Static deployment and API-key controls

- Preserve a static GitHub Pages export unless the deployment topology is explicitly re-approved.
- There is no trusted application server in the deployed topology. Do not add server-only routes and assume they work on GitHub Pages.
- Never place an OpenAI API key in source code, fixtures, tests, screenshots, documentation examples, `.env` files committed to Git, GitHub Actions variables, build-time public environment variables, URLs, query strings, analytics, logs, error reports, or generated assets.
- Store the operator-provided runtime configuration only in `sessionStorage` under `unimelb-open-day-2026:session-config:v1`. Never use `localStorage` or cookies for it.
- Keep the key field masked by default. Require explicit risk acknowledgement before live mode can be saved.
- Clearing the key must synchronously remove it from `sessionStorage`, clear in-memory client instances, and return the session to canned mode.
- Never describe `sessionStorage` as secure storage. The setup UI must state that scripts, extensions, developer tools, and memory inspection can read the key.
- Do not send the key to GitHub, telemetry, a proxy, or any origin other than the configured OpenAI API origin.
- Treat browser-direct API use as an event-only, high-risk exception. For general deployment, recommend a trusted server-side API boundary.

## Visitor safety and privacy

- Apply deterministic local validation before any live API request.
- Limit free text to 240 characters and university/study topics.
- Block email addresses, phone numbers, URLs, address-like text, long identifiers, personal-data introductions, unsafe content, personal crises, and obvious prompt-injection phrases.
- Never persist raw questions, transcripts, or model outputs. Do not place visitor content in `sessionStorage`, `localStorage`, URLs, analytics, logs, or error reports.
- Clear the visitor question, transcript, and derived model output on manual reset and inactivity reset.
- Preserve the visible educational-demo, personal-information, AI-error, and age disclosures.
- Keep a chips-only mode. Free text is for visitors aged 13+ unless the appropriate University privacy contact approves another arrangement.
- Treat every visitor string and model string as untrusted text. Never render raw model output as HTML.

## Demo integrity

- The headline threat is privileged policy tampering, not user-originated prompt injection.
- Every compromised session must reveal the controlled policy and complete a clean re-check before the final state.
- Keep the exact approved demo-only compromised line unchanged.
- The compromised deterministic enforcement must not invent facts, disparage the comparator, or suppress the X-Ray.
- Keep the clean verifier symmetric and allow `unimelb`, `competitor`, `tie`, or `depends`.
- Aggregate clean order disagreement to `depends` and label order sensitivity.
- Describe the client-side prompt fingerprint as a local teaching device, never as remote attestation or proof of application security.

## Content and brand

- Use only reviewed evidence marked safe for public comparison.
- Do not add rankings, ATARs, fees, salaries, employment rates, scholarships, guarantees, or admissions claims without explicit approval and current comparable official evidence.
- Do not use a comparator logo, colours, mascot, or visual identity.
- Gate official University assets behind approval; otherwise use text and letter avatars only.
- Keep advocacy respectful, acknowledge relevant comparator strengths, and label subjective opinions.
- Do not imply official admissions advice, comparator endorsement, partnership, or participation.

## Verification

- For new behaviour, add or update focused tests first when practical.
- Before reporting completion, run the smallest relevant test, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` as appropriate.
- Run `pnpm test:e2e` for user-flow, reset, responsive, accessibility, or deployment-path changes.
- Test 1920x1080 and 1366x768, keyboard operation, reduced motion, canned mode without a key, and live mode only with an approved temporary key.
- Review the generated static `out/` tree for accidental secrets before deployment.
- Update the runbook, approval checklists, threat model, and deviation register when behaviour or operational risk changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
