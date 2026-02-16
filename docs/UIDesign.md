# Stark OS UI Roadmap (Integrated Runtime + UI Foundation Plan)

This document merges:

- A clean UI-first foundation
- Stark-native runtime alignment
- Existing orchestrator capabilities
- Future ecosystem expansion

Stark is not a desktop clone.
It is a distributed runtime rendered as an operating system.

---

# Core Design Principle

Stark OS = Identity + Runtime + Visual Surface

The UI must:

1. Stand on its own as a usable OS surface
2. Accurately reflect distributed runtime state
3. Never fake infrastructure abstractions
4. Stay aligned with orchestrator semantics

---
# Phase 1 — Identity Binding Layer

Now bind UI to runtime authority.

| Step | Description |
|------|------------|
| 2.1 | Login UI |
| 2.2 | Token refresh without UI reload |
| 2.3 | Session persistence |
| 2.4 | Node/environment context indicator |
| 2.5 | Workspace restoration on login |

Identity is the root of Stark.

User → Authority → Node → Pod

---

# Phase 2 — UI Core Foundation (Before Infra Surfaces)

This phase builds structural UI primitives independent of orchestrator features.

| Step | Description |
|------|------------|
| 1.1 | Shell Layout Engine (root container, responsive layout system) |
| 1.2 | Window Manager Core (open, close, focus, z-index, resize) |
| 1.3 | Surface Mount Engine (iframe/container abstraction) |
| 1.4 | Global State Store (UI-only state: focus, layout, active workspace) |
| 1.5 | Mobile/Desktop Mode Switch |
| 1.6 | Workspace Model (multiple desktops) |

Nothing here depends on pods yet.

This prevents orchestrator coupling from corrupting UI architecture.

---

# Phase 3 — Visual Pod Rendering Core

Now integrate runtime into UI foundation.

| Step | Description |
|------|------------|
| 3.1 | Visual pack contract (visual flag in manifest) |
| 3.2 | Pod mount lifecycle integration |
| 3.3 | Multi-instance rendering (multiple pods of same pack) |
| 3.4 | Safe unmount on pod termination |
| 3.5 | Crash containment (UI never dies if pod dies) |

This is the OS kernel boundary for UI.

---

# Phase 4 — Runtime Viewer (Pod-First UX)

Instead of desktop-first metaphors, build runtime awareness.

| Step | Description |
|------|------------|
| 4.1 | Running pods selector (mobile-style switcher) |
| 4.2 | Pod status indicator (running, restarting, degraded) |
| 4.3 | Replica visibility for services |
| 4.4 | Kill/restart pod controls |
| 4.5 | Focus switching across pods |

This is your Task Manager equivalent.

---

# Phase 5 — System Packs (Validating the Pack Model)

All system features must be packs.

| Pack | Purpose |
|------|---------|
| File Explorer | Volume surface |
| Node Manager | Node status & lifecycle |
| Logs Viewer | JSON log viewer |
| Settings | User & workspace config |

System packs must:

- Follow same lifecycle as user packs
- Use same mount engine
- Use same permission model

No hardcoded privileges.

---

# Phase 6 — Storage & Volume Surface

Expose storage without abstracting it incorrectly.

| Step | Description |
|------|------------|
| 6.1 | Show volumes attached per pod |
| 6.2 | Volume browser (node-local) |
| 6.3 | Show shared volume relationships |
| 6.4 | Export/download volume |
| 6.5 | Indicate node ownership constraints |

This aligns UI with your node-local volume model.

---

# Phase 7 — Ephemeral Data Plane Integration

Surface PodGroup and TTL-based ephemeral state.

| Step | Description |
|------|------------|
| 7.1 | PodGroup membership viewer |
| 7.2 | Live membership update indicators |
| 7.3 | Ephemeral state inspector (debug mode) |
| 7.4 | TTL expiration visualization (optional dev view) |

This is uniquely Stark.

Most browser OS clones don’t expose runtime grouping.

---

# Phase 8 — Network & Policy Surface

Your orchestrator routes and enforces policy.
The UI should optionally surface it.

| Step | Description |
|------|------------|
| 8.1 | Ingress endpoint visibility |
| 8.2 | WS vs WebRTC connection status |
| 8.3 | Active connection viewer |
| 8.4 | Policy decision debug panel |
| 8.5 | Contact-tracing visual surface (future use case) |

Default users don’t need this.
Dev mode should expose it.

---

# Phase 9 — Inter-Pack Interaction Layer

Now Stark becomes composable.

| Step | Description |
|------|------------|
| 9.1 | Global event bus |
| 9.2 | Structured drag & drop |
| 9.3 | Intent system ("open with") |
| 9.4 | Capability linking between packs |

This is where Stark stops being a dashboard
and becomes a composable runtime OS.

---

# Phase 10 — Desktop Chrome & Experience Polish

Only after runtime is stable.

| Step | Description |
|------|------------|
| 10.1 | Desktop canvas |
| 10.2 | App launcher |
| 10.3 | Taskbar (running + pinned pods) |
| 10.4 | Notification center |
| 10.5 | Theme engine |
| 10.6 | Multi-workspace UI |

This is aesthetic + usability layer.
Not architecture.

---

# Unified Pack Contract (Applies to All Packs)

All packs — visual or headless — follow the same contract.

Lifecycle hooks:

| Hook | Purpose |
|------|---------|
| init | Pod starts |
| mount | UI surface attaches (if visual) |
| onFocus | Becomes active |
| onBlur | Moves to background |
| unmount | Surface detaches |
| destroy | Pod terminates |

Headless packs simply do not implement mount.

---

# Critical System Invariants

These must hold true across UI and orchestrator:

- UI never blocks routing or policy engine
- Killing a pod immediately unmounts its UI
- Token refresh does not remount visual pods
- Service replicas are distinct runtime instances
- Workspace restore is deterministic
- System packs follow same rules as user packs
- Ephemeral state never corrupts control plane state

If these hold, Stark is stable.

---

# What This Plan Avoids

- Marketplace complexity
- Third-party sandboxing
- Over-abstracted filesystem metaphors
- Fake desktop illusions disconnected from runtime

---

# Final Order For You (Practical Execution)

1. Shell layout + window manager
2. Login + token stability
3. Pod mount/unmount correctness
4. Running pods selector
5. Pod status + restart visualization
6. Convert Pod Manager into a real system pack
7. Volume browser
8. Logs viewer
9. Inter-pack event bus
10. Desktop chrome polish

---

Stark OS should feel like:

A live distributed system you can touch.

Not a web page pretending to be Windows.
