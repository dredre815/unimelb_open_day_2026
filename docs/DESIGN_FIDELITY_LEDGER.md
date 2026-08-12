# Design Fidelity Ledger

This ledger compares the generated concept references in `docs/design/concepts/` with the implemented static application captured in `docs/design/qa/`.

- **Hierarchy:** The implementation preserves the concept's attract-page sequence: quiet institutional header, dominant question, three connected agents, six sample prompts, composer, and privacy disclosure. During debate, the advocate rails frame the transcript; from the first verdict onward, they collapse into a locked context strip so the staged verdict, X-Ray, and clean re-check become the primary focus.
- **Spacing:** Major 16:9 gutters, agent spacing, and full-width action rails follow the concepts. At 1366x768 the operator setup uses an internal scroll region so all controls remain reachable without document scrolling.
- **Typography:** Space Grotesk remains the high-impact display face and Inter remains the UI/content face. Generated concept text was replaced with semantic HTML and the exact approved product copy.
- **Colour:** The implemented navy, blue, cyan, violet, amber, red, and mint roles match the concept palette. Colour is never the only status signal; every state also has a text label or icon.
- **Effects:** The connection trace, status pulse, message entrances, glass surfaces, and local integrity glitch reproduce the concept's control-room tone. Reduced-motion preferences suppress continuous motion.
- **Density:** The attract view stays intentionally open. The active view is denser, but long transcript, evidence, and prompt content scroll only inside their own bounded panels.
- **Interaction states:** The final application adds real disabled, focus, thinking, speaking, Judge-deliberating, controlled-first-verdict, visitor trust prediction, failed-integrity, clean-recheck, fair-result, and complete states that the static concepts could only imply. **It looks convincing** and **Something feels off** both enter the same mandatory X-Ray and are not stored.
- **Setup deviation:** The final setup makes Prepared demo mode usable without a key, adds an explicit client-side key-risk acknowledgement, exposes four configurable agent roles, and lets the operator choose 2–5 rounds. These functional requirements intentionally replace the concept's illustrative connected state.
- **X-Ray deviation:** The implementation withholds the X-Ray until the visitor answers **Would you trust this verdict?**, then withholds the clean calls until **Run a clean re-check**. The explanation uses a plain-language three-step fingerprint story; abbreviated SHA-256 values and production limitations sit under **Technical details (optional)**.
- **Debate-order clarification:** Advocate calls remain parallel within each round for latency, while visible messages use a deterministic University of Melbourne → Comparator order for a clear kiosk story.

## Verification artifacts

- Concepts: `attract-screen.png`, `debate-xray-screen.png`, and `session-setup-screen.png`; each is 1672x941.
- Final captures: `attract-1920x1080.png`, `debate-xray-1920x1080.png`, `setup-1920x1080.png`, plus corresponding 1366x768 captures.
- Browser method: Codex in-app Browser for live DOM, console, responsive, and full-flow inspection; Playwright Chromium for repeatable viewport screenshots and end-to-end checks.
