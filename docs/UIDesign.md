# Stark OS UI Roadmap (Architecture-Aligned Plan)

This plan is Stark-native.  
It assumes:

- Orchestrator already exists  
- Pods are authoritative runtime units  
- Identity + routing already work  
- UI is an expression layer over distributed compute  

This is not a generic web desktop clone roadmap.

---

# Core Principle

Stark is:

A distributed runtime that renders visually.

Not:

A browser pretending to be Windows.

Everything below reflects that.

---

# Unified Pack Model

There is no such thing as a separate “UI Pack.”

A Pack is universal.

Some packs:
- expose network endpoints  
- run compute  
- are headless  

Some packs:
- expose a visual surface  

Architecturally they all share:

- Identity model  
- Lifecycle model  
- Permission model  
- Registration contract  

The only difference is a simple manifest property:

visual: true or false

---

# Phase 1 — Identity Surface (Foundation)

| Step | Layer | Description |
|------|-------|------------|
| 1.1 | Login UI | Auth flow tied to node registration |
| 1.2 | Token Refresh | Seamless token refresh without UI reset |
| 1.3 | Session Binding | User ↔ Node ↔ Orchestrator identity binding |
| 1.4 | Workspace Persistence | Restore previously running pods on login |

This is not cosmetic UI work.

This binds:

User → Authority → Runtime → Visual surface.

If this layer is unstable, everything above it breaks.

---

# Phase 2 — Visual Pod Rendering Core

This is the real foundation.

| Step | Layer | Description |
|------|-------|------------|
| 2.1 | Visual Surface Contract | Pod declares visual capability and exposes a render endpoint |
| 2.2 | Pod Mount Engine | OS mounts pod into controlled surface (iframe or equivalent) |
| 2.3 | Multi-Pod Rendering | Multiple pods of same pack render independently |
| 2.4 | Lifecycle Control | mount → active → background → unmount |
| 2.5 | Crash Containment | If a pod crashes, OS survives |

This is the Stark equivalent of a kernel UI boundary.

No desktop grid before this works perfectly.

---

# Phase 3 — Runtime Viewer (Pod-First, Not File-First)

Stark is pod-first, not file-first.

| Step | Layer | Description |
|------|-------|------------|
| 3.1 | Running Pods Selector | Mobile-style active pod switcher |
| 3.2 | Focus Model | Deterministic focus switching |
| 3.3 | Pod Kill / Restart | Kill pod → UI unmount instantly |
| 3.4 | Pod Status Indicator | Healthy / degraded / disconnected |

This is your runtime viewer equivalent.

---

# Phase 4 — System Pods (First-Class, Not Hardcoded)

System features must be packs.

| Step | Layer | Description |
|------|-------|------------|
| 4.1 | File Explorer Pack | Uses Stark Storage API |
| 4.2 | Node & Pod Manager Pack | Visual control plane |
| 4.3 | User Settings Pack | Profile, session, permissions |
| 4.4 | Logs / Debug Console Pack | Inspect runtime events |

These validate your Pack API design.

Nothing special.  
No hidden privileges.  
Same contract as user packs.

---

# Phase 5 — Inter-Pack Interaction Model

Now Stark becomes different.

| Step | Layer | Description |
|------|-------|------------|
| 5.1 | Global Event Bus | Cross-pack communication |
| 5.2 | Drag & Drop Bus | Structured data passing |
| 5.3 | Intent System | “Open with…” capability |
| 5.4 | Capability Linking | One pack invokes another pack |

This replaces traditional SaaS silos.

This is composable infrastructure.

---

# Phase 6 — OS Surface Polish

Only after runtime stability.

| Step | Layer | Description |
|------|-------|------------|
| 6.1 | Desktop Canvas | Optional visual grid |
| 6.2 | Window Chrome | Drag, resize, snap |
| 6.3 | Taskbar | Running + pinned pods |
| 6.4 | Notification Center | System-level events |
| 6.5 | Mobile Mode | Single-surface adaptive UI |
| 6.6 | Multi-Workspace | Multiple desktop contexts |
| 6.7 | Theme Engine | Visual customization |

These are UX layers.

They should not dictate architecture.

---

# Pack Lifecycle Model (Unified)

All packs follow this contract:

| Hook | Purpose |
|------|---------|
| init | Called when pod starts |
| mount | Called when UI surface attaches |
| onFocus | When pack becomes active |
| onBlur | When pack moves to background |
| unmount | When surface detaches |
| destroy | When pod terminates |

Headless packs simply never implement mount.

---

# System Invariants (Design Truths)

These are more important than UI components:

- A pod can only mount once per workspace  
- Killing a pod instantly unmounts UI  
- Token refresh does not reload visual pods  
- Multiple pods of same pack are independent  
- Workspace restore must be deterministic  
- System pods follow same lifecycle contract  
- UI must never block orchestrator routing  

If these are stable, Stark becomes unbreakable.

---

# What NOT To Do Yet

- Marketplace  
- Third-party sandboxing  
- Deep RBAC UI  
- Plugin economy  
- Over-abstracted filesystem  

That is V2.

---

# Strategic Identity

Other browser OS projects are filesystem-centric.

Stark is runtime-centric.

Their center:
Files + apps.

Your center:
Nodes + pods + authority + capability linking.

The UI should reflect distributed compute,
not mimic legacy desktop metaphors.

---

# Practical Next Moves

1. Stabilize login + token refresh  
2. Make visual pod mount/unmount bulletproof  
3. Build running pods selector  
4. Convert one feature into a true system pack  
5. Then layer desktop chrome  

That is the correct Stark-native order.
