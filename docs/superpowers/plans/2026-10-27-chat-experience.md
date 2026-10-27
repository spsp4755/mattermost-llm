# Chat Experience Implementation Plan

> Execute inline with superpowers:executing-plans; use regression tests before fixes.

**Goal:** Fix popups and add model-independent admin controls and requester-only RHS opening.
**Architecture:** Existing transport boundary filters responses; explicit generation dialect; body portals; targeted websocket event.
**Tech Stack:** Go, React, TypeScript, Jest; no new runtime dependency.
**Spec:** ../specs/2026-10-27-chat-experience-design.md

## Constraints
- Mattermost 10.11.10, offline packaging, preserve existing settings, default reasoning hidden.
- Do not send generation toggles unless configured; explicit settings override the corresponding extra JSON leaf.

## Tasks
- [x] Server: regression tests for split/incomplete tags and typed reasoning, SSE errors, default hide and enabled display. Update bot config, primary request parsing, secondary output parsing, debug post redaction, parameter validation.
- [x] Webapp: config roundtrip tests, controls, portal dialog tests (viewport parent, focus, Escape); update both diagram and debug dialogs.
- [x] RHS: targeted event after intake; test request scoping, inactive channel, duplicate events and opt-out; use 10.11.10 SELECT_POST action.
- [x] Validate all tests/types/build; compare upstream APIs/licenses; inspect v0.2.0 bundle with REA; document sources and deployment limits; produce versioned bundle.

## Review focus
Partial tags in each token boundary; reasoning-only output; JSON output/debug leakage; different users/channels; dialog focus and transformed scroll parents.
