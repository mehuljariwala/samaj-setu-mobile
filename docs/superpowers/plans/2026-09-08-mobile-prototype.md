# Samaj Setu mobile prototype implementation plan

Goal: Six approved clickable mobile screens using fictional data and simulated verification.
Architecture: One client React experience, shared phone shell, Shadcn primitives, in-memory state; a separate reviewer navigator exposes demo states.
Spec: Parent workspace docs/superpowers/specs/2026-09-08-samaj-setu-design.md, narrowed by approved six-screen prototype scope.

- [x] Create theme, welcome and shell; open the compiled first preview.
- [x] Add registration, simulated OTP/certificate, review and correction states.
- [x] Add member home, discovery filters, protected profile sheets and saved cards.
- [x] Add admin queue and approve/correct/reject decisions updating applicant status.
- [ ] Validate production build and TypeScript, then privately publish and open result.

Constraints: Fresh implementation. Gujarati-first with English toggle. No personal data is transmitted. No production authentication claims. Keep preview controls outside the member flow. Reversible presentation code is verified by compilation, without redundant implementation-mirroring tests or unrequested browser QA.
Acceptance: Six populated screens; required fictional certificate; correction/rejection reasons; state-preserving navigation; working filters/saving; responsive CSS; compiled successful route.
