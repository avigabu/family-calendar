# SyncUp Family Calendar - Developer Guidelines & Expectations

This document outlines the general expectations, coding standards, design aesthetics, and verification processes required when developing or modifying the SyncUp application. **The AI developer must read this file at the start of every session before starting work on any task.**

---

## 1. Design & User Experience (UX) Expectations
- **Vibrant & Premium Aesthetics**: The application must look modern, elegant, and polished. Avoid plain colors; instead use HSL tailored color schemes, subtle gradients, and glassmorphism.
- **Micro-Animations & Transitions**: Interactive elements (buttons, hover states, modal openings) must feel responsive and alive with smooth CSS transitions.
- **RTL & LTR Support**: The application supports English, German, and Hebrew. Any layout changes must be fully responsive, handle text alignments properly, and respect the reading direction (RTL for Hebrew, LTR for English/German).
- **No Simple Placeholders**: If any assets, images, or mock content are required during development, generate actual workable demonstration elements. Do not leave "TODO" UI blocks.

---

## 2. Technical Stability & Integration Guidelines
- **Maintain Sync Integrity**: Do not make changes that break or conflict with the bi-directional Google Calendar Sync cloud functions (`functions/index.js`). Keep the flat-recurrence expansion architecture intact.
- **Database Schema Constraints**: Strictly adhere to the schema structures defined in `ARCHITECTURE.md` for `users`, `events`, and `families`. Adding fields is allowed, but modifying existing fields requires verification of both the SPA client and the sync functions.
- **Preserve Existing Comments**: Retain existing documentation, comments, and docstrings in code files.
- **Offline Persistence**: Ensure Firestore offline persistence (`enablePersistence()`) remains enabled and functional.
- **Security & Privacy**: Ensure user data is fully secure. Strictly validate permissions, respect visibility controls, and maintain application security during modifications.

---

## 3. Workflow & Verification Requirements
- **Planning Mode**: For any non-trivial change, always design the implementation first, save it in `implementation_plan.md` in the artifacts directory, and obtain explicit user approval before writing code.
- **Progress Tracking**: Track tasks in real-time in `task.md` using completed `[x]`, in-progress `[/]`, and uncompleted `[ ]` checklist notation.
- **Verification & Deployment**:
  - Always run the Express development server (`node server.js`) to verify syntax, routing, and console logs.
  - Deploy verified changes using the `firebase deploy --only hosting` command to ensure the live environment remains stable and updated.
  - Summarize modifications and testing results in `walkthrough.md`.
- **Implicit Actions on 'Implement' Approval**: When the user approves the implementation plan:
  1. Complete and test all planned code updates.
  2. Deploy the changes to Firebase Hosting (`firebase deploy --only hosting`).
  3. Update git/GitHub with proper staging and commit actions.
  4. Update `ARCHITECTURE.md` (specifically Section 5 - Modifications Log) to document the changes and determine if a new version is needed.

---

## 4. Communication Guidelines
- **No Mixed Languages**: Do not write English and Hebrew mixed in the same line of text when communicating with the user. Mixed text causes rendering layouts to jumble, making it extremely hard to read. Write either entirely in English or entirely in Hebrew per line.
