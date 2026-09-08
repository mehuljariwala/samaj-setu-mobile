# Samaj Setu — mobile web product specification

Date: 8 September 2026

Status: Consolidated product design for review before implementation planning.

This specification records the conversation decisions and supersedes conflicting assumptions in the supplied BRD. Build a fresh app; do not inspect or reuse the existing implementation. The supplied images are visual references, not functional requirements.

## 1. Product and release boundary

A Gujarati-first, mobile web matrimonial directory for the Khatri Kshatriya community. Parents and candidates can register independently. One candidate has one canonical profile; a parent can manage multiple children. Core functions remain free.

The first release covers invitation and registration, OTP authentication, mandatory certificate verification, duplicate resolution, linked family accounts, staged biodata creation, candidate consent, publication moderation, private discovery, saved profiles, interests, viewer-specific photo permissions, mutual contact reveal, protected sharing, and mobile admin operations.

Advanced astrological computation and ranking, photographed kundali extraction, events, and additional communities remain later phases. Do not present a compatibility score in the first release. Declared astrological details may be captured and shown with appropriate visibility.

## 2. Access boundaries

| State | Access |
|---|---|
| Signed out | Welcome, authentication, registration entry, essential policy and support information only |
| Authenticated; application incomplete | Own application and support |
| Submitted; awaiting review | Own application status and support |
| Correction requested | Own requested corrections, resubmission, and support |
| Verification approved | Member directory, saved profiles, family management, biodata completion |
| Biodata approved and candidate consent active | Candidate is discoverable and eligible to send interests |
| Rejected or suspended | Own decision/status and support; no member access |

Enforce permissions on the server for every record and media request, not merely through navigation. Shared links never bypass authentication or approval. Admin access uses a separate role; a member cannot grant it to themselves.

The first approved child verification unlocks a parent's member access. Each additional child has independent verification, consent, and publication status. Candidate-specific actions must always identify the acting candidate. A paused or unpublished candidate cannot send new interests.

## 3. Registration and identity review

1. Verify the operator's phone with OTP.
2. Choose whether registering for self or a child.
3. Enter candidate name, date of birth, relevant personal and family details, and relationship to the operator.
4. Upload the candidate's birth certificate; it is mandatory for submission.
5. Check for an existing candidate profile before collecting full biodata.
6. Submit the complete verification application.
7. Show: “Your profile is under review. Please allow up to 24 hours for admin approval.”

Save drafts and allow interrupted registration to resume. The 24-hour target starts at complete submission. It is a review target, not automatic approval. After the target is exceeded, show an honest delayed-review state and flag the application for admins.

Admins review all submitted details and the certificate. A certificate is supporting evidence, not automatic proof of account ownership, consent, or community membership. Inconsistencies or unverifiable details require correction or rejection.

## 4. Duplicate detection and ownership

Phone numbers identify operator accounts, not candidate uniqueness. Do not automatically merge or reject records solely because names and birth dates match. Flag possible duplicates for comparison and admin resolution.

A confirmed existing profile leads to an access-request workflow rather than a second profile. Reveal no biodata or existing operator contact information during this process. An admin verifies the relationship and authority before linking access. Record the linking decision.

Parent and candidate accounts can manage a shared candidate profile. The candidate controls publication consent. A parent cannot supply that consent on the candidate's behalf. Where a candidate cannot complete the normal consent process, keep publication blocked until an explicit assisted verification process is defined and completed; do not silently substitute parent consent.

## 5. Biodata and publication review

After verification approval, offer “Paste biodata” and “Guide me step by step.” Prefill verified details. Require review of extracted fields and visibly flag uncertain or missing values. Never invent missing information or auto-publish imported content.

Use short sections for personal information, education and occupation, family and community, declared astrology, photographs and janmakshar, and contact preferences. Allow optional fields to be skipped and save progress automatically.

Changes to identity-verified fields trigger re-verification. Candidate consent and a second admin review of completed biodata are required before publication. Identity approval and publication approval remain separate records and states.

Proposed edit policy: published content changes create a revision for review while the approved version remains visible; identity changes or withdrawn consent hide the profile until resolved. Privacy restrictions, pause, and consent withdrawal take effect immediately.

## 6. Member navigation

- Home: next useful action, profile completion, pending requests, and review status.
- Discover: directory, filters, saved profiles, profile details, and photo-access requests.
- Interests: received, sent, and accepted requests, scoped to the selected candidate.
- Family: managed candidates, linked accounts, consent, privacy, pause, match-found, and deletion controls.

Keep the selected candidate visible when an action depends on their identity. Approved members without a published candidate can browse, but cannot send interests.

## 7. Community rules

Capture structured mosal, paternal surname, sub-community, and sect with confirmation of imported values. Apply confirmed mandatory exclusions to candidate-specific discovery and interest eligibility. Unknown information must not be treated as evidence of eligibility.

Shared mosal is a hard exclusion per the BRD. Distinguish universal community rules from a family's chosen hard requirements for sect and sub-community. The BRD's paternal-surname and declared-relation rules need a precise, leadership-ratified comparison definition before enforcement is implemented. Do not infer genealogical identity from an approximate text match.

Explain exclusion or insufficient-information states in plain Gujarati and English. No unsupported astrological certainty or computed scores in this release.

## 8. Interests, photos, and contacts

Support pending, accepted, declined, withdrawn, and expired interest states, plus member blocking. Avoid duplicate pending requests between the same candidate pair. Explain what accepting reveals before confirmation.

Photo permission is viewer-specific and separate from contact consent. Birth certificates are never member-visible. Janmakshar visibility is separately controlled. Protect media at the storage and request layers; do not send full images to unauthorized clients and merely blur them visually.

Acceptance grants the authorized parties access to the configured contact details. Revocation can prevent future access but cannot recall information already seen or copied. The same limitation applies to approved photos; do not promise screenshot prevention.

## 9. Sharing

Share a generic branded invitation card or message with a protected profile link. Do not embed candidate names, photos, contact details, or biodata in publicly accessible cards or link previews. Recipients must authenticate and be approved before viewing permitted profile information. No contact-free downloadable biodata card exception: the conversation replaced that BRD feature with protected sharing.

## 10. Admin area

Separate mobile-friendly screens:

1. Dashboard: verification and publication queues, approaching/overdue targets, and corrections awaiting resubmission.
2. Registrations: all registrations, including incomplete drafts; search and filters for status, operator, candidate, and submission time.
3. Verification review: submitted details, private certificate inspection, duplicate candidates, previous decisions, and review actions.
4. Publication review: completed biodata, active consent evidence, and field-level issues.
5. Member detail: linked accounts, candidate profiles, status, and decision history.

Review actions:

- Approve: complete the corresponding verification or publication transition.
- Request correction: specify fields and an applicant-facing explanation; block the relevant approval until resubmitted.
- Reject: require a reason and show an appropriate applicant-facing explanation with support access.

Record actor, timestamp, reason, and affected revision for every decision. Keep internal notes separate from applicant messages. Prevent conflicting concurrent review decisions. Do not expose sensitive certificates in queue thumbnails, notifications, or logs.

## 11. Mobile visual and interaction direction

Proposed palette: warm ivory surfaces, deep green primary actions, restrained gold accents. Use the cultural warmth of reference 1, the spacing and card consistency of reference 2, and focused task flows of reference 3. Religious hero artwork is not required.

Gujarati is default, with an obvious English switch that preserves progress. Use readable Gujarati typography, text-labelled bottom navigation, large touch targets, clear contrast, and one primary action per step. Avoid ornamental content crowding forms or discovery.

Design for narrow phones, on-screen keyboards, camera/file uploads, poor connectivity, refresh, browser back, OTP retry, interrupted uploads, validation errors, empty queues, and permission-denied states. Optional installation must never be required.

## 12. Logical system boundaries

Separate responsibilities for authentication and permissions, verification and family linking, candidate/profile revisions, consent and media access, discovery and community eligibility, interests/contact grants, and admin review/audit.

Persist application and moderation state on the server. Use private storage for documents and photos. Parse pasted biodata as untrusted input into a draft schema and require human confirmation. Notifications must not leak personal details and must not become the source of truth for approval state.

Technology and hosting selection belong to the next implementation plan. Real OTP delivery, storage configuration, deployment credentials, and external notification setup must be identified as integration requirements; never claim simulated services are production-ready.

## 13. Validation and release criteria

- Signed-out and unapproved users cannot retrieve directory records or protected media through direct requests.
- Required certificate, missing fields, upload failures, and duplicate cases prevent inappropriate submission or publication.
- Parent and candidate linking cannot create a second canonical profile or grant unauthorized access.
- Verification approval unlocks only the intended access; publication requires separate approval and active candidate consent.
- Corrections and rejection show the right status, preserve history, and never accidentally unlock access.
- Multi-child actions use the selected candidate and their own eligibility state.
- Photo grants and contact grants remain separate and enforceable server-side.
- Shared URLs and previews contain no protected biodata.
- Gujarati and English journeys work on small phone screens and survive refresh/interruption.
- Test with representative Gujarati-speaking parents; assess completion without assistance and recoverability from mistakes.

## 14. Decisions to settle during planning

These are explicit planning inputs, not silently implemented assumptions: exact initial verification fields; certificate retention and deletion policy; candidate consent identity mechanism; leadership-ratified community-rule definitions; interest expiry; production OTP and hosting providers; named support/grievance operator; and applicable legal requirements and effective dates.

Maintain the BRD's proposed seeded launch target of 20–30 consented and approved girls' profiles pending leadership ratification. Basic operational queue metrics are launch scope; advanced analytics remain later scope.
