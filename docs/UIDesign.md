# Stark OS UI Roadmap

---

# Core Principle

Stark OS is:

Identity → Runtime → Visual Surface → Control Interface

The UI is both:
- A visual control plane
- A programmable command environment

---

# Phase 1 — Identity First (Non-Negotiable)

Login is the root of authority.

| Step | Description |
|------|------------|
| 1.1 | Login UI |
| 1.2 | Token refresh without UI reload |
| 1.3 | Session persistence |
| 1.4 | Node binding awareness (which node am I connected to?) |
| 1.5 | Workspace restore after login |
| 1.6 | Environment indicator (production / staging / local) |

Nothing renders without identity.

This binds:
User → Authority → Node → Pod lifecycle.

---

# Phase 2 — UI Shell Foundation

Build the structural UI before exposing runtime.

| Step | Description |
|------|------------|
| 2.1 | Root shell layout engine |
| 2.2 | Window manager core (open, close, focus, z-index) |
| 2.3 | Surface mount abstraction (iframe/container isolation) |
| 2.4 | Global UI state store (focus, layout, workspace) |
| 2.5 | Desktop vs Mobile layout modes |
| 2.6 | Multi-workspace model |

This prevents orchestrator logic from corrupting UI design.

---

# Phase 3 — Visual Pod Rendering Core

Integrate runtime safely into the UI.

| Step | Description |
|------|------------|
| 3.1 | Visual pack contract (visual property in manifest) |
| 3.2 | Pod mount lifecycle integration |
| 3.3 | Multi-instance rendering (multiple pods of same pack) |
| 3.4 | Safe unmount on pod termination |
| 3.5 | Crash containment (UI survives pod failure) |

This is the Stark UI kernel boundary.

---

# Phase 4 — Terminal Pack (Early, Not Late)

The Terminal is not optional.
It is the power surface of Stark.

It should be implemented early.

## Terminal Responsibilities

| Feature | Description |
|----------|------------|
| Stark CLI Integration | Translate stark commands into orchestrator API calls |
| Real-time Output | Stream responses from pods/services |
| Command History | Persistent per user |
| Tab Completion | Pack names, pod IDs, nodes, services |
| Context Awareness | Current node / workspace context |
| Structured Output Mode | JSON mode for advanced users |

---

## Stark Command Mode

Examples:
- stark pod create
- stark service create
- stark volume attach
- stark pod restart
- stark group join

The Terminal Pack becomes the official command surface for Stark.

---

## Linux Command Support (Optional Layer)

Two possible models:

### Model A — Pure Stark Mode
Terminal only supports Stark commands.

### Model B — Hybrid Mode
Terminal supports:
- Stark commands
- Linux commands executed in:
  - A system utility pod
  - Or a local node execution context

Recommendation:
Start with Stark mode only.
Add Linux execution later through a utility/system pod.

This keeps architecture clean.

---

# Phase 5 — Runtime Viewer (Pod-First UX)

Now expose runtime state visually.

| Step | Description |
|------|------------|
| 5.1 | Running pods selector (mobile-style switcher) |
| 5.2 | Pod status indicator (running, restarting, degraded) |
| 5.3 | Replica visibility for services |
| 5.4 | Kill/restart controls |
| 5.5 | Quick jump from pod to logs |

The Terminal + Runtime Viewer together form control parity.

---

# Phase 6 — System Packs (First-Class)

All system features must be implemented as packs.

| Pack | Purpose |
|------|---------|
| Terminal | Command surface |
| File Explorer | Volume browser |
| Node Manager | Node lifecycle viewer |
| Pod Manager | Pod lifecycle control |
| Logs Viewer | Structured JSON log viewer |
| Settings | User + workspace config |

Nothing should be hardcoded into the shell.

---

# Phase 7 — Storage & Volume Surface

Expose volumes without faking a global filesystem.

| Step | Description |
|------|------------|
| 7.1 | Volume attachment visibility per pod |
| 7.2 | Node-local volume browser |
| 7.3 | Shared volume relationship view |
| 7.4 | Download/export volume |
| 7.5 | Indicate node affinity constraints |

---

# Phase 8 — Ephemeral Data Plane Surface

You built PodGroup and TTL ephemeral state.
Surface it optionally.

| Step | Description |
|------|------------|
| 8.1 | PodGroup membership viewer |
| 8.2 | Live membership update indicators |
| 8.3 | Debug view for ephemeral state |
| 8.4 | TTL expiration visibility (dev mode) |

This is uniquely Stark.

---

# Phase 9 — Network & Policy Debug Surface

Optional but powerful.

| Step | Description |
|------|------------|
| 9.1 | Ingress endpoint visibility |
| 9.2 | WS vs WebRTC status indicators |
| 9.3 | Active connection viewer |
| 9.4 | Policy decision debug panel |

This makes Stark feel like a living distributed system.

---

# Phase 10 — Inter-Pack Interaction Layer

Now enable composability.

| Step | Description |
|------|------------|
| 10.1 | Global event bus |
| 10.2 | Structured drag & drop |
| 10.3 | Intent system |
| 10.4 | Capability linking |

Terminal should also be able to trigger these interactions.

---

# Phase 11 — Desktop Chrome & Experience Polish

Only after runtime and terminal stability.

| Step | Description |
|------|------------|
| 11.1 | Desktop canvas |
| 11.2 | App launcher |
| 11.3 | Taskbar (running + pinned pods) |
| 11.4 | Notification center |
| 11.5 | Theme engine |
| 11.6 | Multi-workspace UI |

---

# Critical Invariants

- Login gates everything
- Terminal and UI have equal authority
- Killing a pod instantly unmounts its UI
- Token refresh does not remount pods
- UI never blocks orchestrator routing
- System packs follow same lifecycle as user packs
- Ephemeral state never pollutes control plane state

---

# What This Architecture Achieves

You end up with:

- A login-gated distributed runtime
- A visual pod surface
- A powerful command terminal
- A composable pack ecosystem
- A runtime-aware OS — not a web desktop clone

Stark becomes:

A programmable operating system
for distributed compute.
