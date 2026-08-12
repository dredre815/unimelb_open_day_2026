# Design Fidelity Ledger

This ledger compares the generated concept references in `docs/design/concepts/` with the implemented static application captured in `docs/design/qa/`.

- **Hierarchy:** The implementation preserves the concept's attract-page sequence: quiet institutional header, dominant question, three connected agents, six sample prompts, composer, and privacy disclosure. The active view keeps the two advocate rails around the transcript and a single verifier/X-Ray rail below.
- **Spacing:** Major 16:9 gutters, agent spacing, and full-width action rails follow the concepts. At 1366x768 the operator setup uses an internal scroll region so all controls remain reachable without document scrolling.
- **Typography:** Space Grotesk remains the high-impact display face and Inter remains the UI/content face. Generated concept text was replaced with semantic HTML and the exact approved product copy.
- **Colour:** The implemented navy, blue, cyan, violet, amber, red, and mint roles match the concept palette. Colour is never the only status signal; every state also has a text label or icon.
- **Effects:** The connection trace, status pulse, message entrances, glass surfaces, and local integrity glitch reproduce the concept's control-room tone. Reduced-motion preferences suppress continuous motion.
- **Density:** The attract view stays intentionally open. The active view is denser, but long transcript, evidence, and prompt content scroll only inside their own bounded panels.
- **Interaction states:** The final application adds real disabled, focus, thinking, speaking, checking, failed-integrity, continuity, fair-result, and complete states that the static concepts could only imply.
- **Setup deviation:** The final setup makes canned mode usable without a key, adds an explicit client-side key-risk acknowledgement, and exposes four configurable agent roles. These are functional requirements, so they intentionally replace the concept's illustrative connected state.
- **X-Ray deviation:** The implementation shows the complete public compromised fragment and states that deterministic code enforcement is also involved. This is more explicit than the concept and is required for an accurate educational explanation.

## Verification artifacts

- Concepts: `attract-screen.png`, `debate-xray-screen.png`, and `session-setup-screen.png`; each is 1672x941.
- Final captures: `attract-1920x1080.png`, `debate-xray-1920x1080.png`, `setup-1920x1080.png`, plus corresponding 1366x768 captures.
- Browser method: Codex in-app Browser for live DOM, console, responsive, and full-flow inspection; Playwright Chromium for repeatable viewport screenshots and end-to-end checks.
