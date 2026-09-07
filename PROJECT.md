# Guiding Principles: Roblox Activity Monitoring System

## 1. Purpose of the System

The primary purpose of this system is to provide deterministic, network-level visibility into a teenager's gaming habits. By passively analyzing router connection states, the system translates raw network traffic into accurate, real-time insights about gaming behavior.

It is designed to solve a specific problem: bypassing the deceptive nature of screen-time apps or "idle" game menus to uncover when *active gameplay* is actually occurring, while maintaining an unalterable historical log of this activity.

## 2. Intended Audience

The system serves two distinct roles, and its outputs must be tailored accordingly:

* **The System Administrator (The Parent):** A highly technical user who operates via the command line, relies on terminal multiplexers (tmux), and requires real-time, low-friction alerts seamlessly integrated into their existing development workflow.
* **The Report Consumer (The Parent/Guardian):** When reviewing historical data, the consumer needs a highly readable, localized (Spanish) dashboard. The report must completely abstract away technical jargon (IP addresses, network protocols, ports) so that anyone can immediately understand *who* played, *when*, and for *how long* at a single glance.

## 3. Core Goals & The User Use-Case

Every future modification to this system should serve the following foundational goals:

* **Differentiate "Active Play" from "Idle Time":**
The most critical function of the system is to distinguish between a game being left open in the background (menus, chat, matchmaking) and active, hands-on gameplay. The system provides two user-facing metrics:
  - **🎮 En Juego Activo (Active Gameplay):** Tracks high-tick UDP replication streams (~60 Hz). Uses dynamic TCP-aware stitching to bridge pauses up to 22 minutes while the Roblox client remains open, or 5 minutes if disconnected.
  - **👨‍💻 Total En Juego (Total In-Game Time):** Tracks overall client engagement (TCP + UDP) consolidated with an empirical P99 threshold of 70 minutes between game sessions on the same day. This captures menu and lobby time while eradicating overnight idle sockets.
* **Ensure Accountability and Catch Evasion:**
The system must account for abrupt, evasive actions—such as a "panic quit" (slamming a laptop shut or pulling a power cord to avoid getting caught). The logging architecture must reliably identify these ghost sessions and record the exact time the physical activity ceased.
* **Maintain Device-Level Attribution:**
Because the household utilizes multiple devices (e.g., a PC and a smartphone/secondary network), the system must aggregate and attribute gaming sessions to the correct physical device. Mathematical interval unions (`computeMergedDuration`) prevent overlapping sessions across devices from inflating total playtime.
* **Provide Zero-Interaction Monitoring:**
The system must operate entirely in the background as a headless daemon. It must proactively alert the administrator when boundaries are crossed (e.g., a session resuming after a significant break or a brand-new session starting) without requiring manual polling.
* **Deliver a "Source of Truth" Dashboard:**
The final HTML report must act as an indisputable ledger of screen time. It must group fragmented micro-connections into clean, logical "sessions," update in real-time, and present the data visually so that enforcing household rules around gaming time is based on objective data rather than guesswork:
  - **5:00 AM Logical Day Cutover:** Night gaming extending past midnight (e.g., 11:00 PM to 2:30 AM) is logically grouped with the evening it began.
  - **Shift Partitioning:** Daily activity is broken down into Morning (5:00 AM – 2:00 PM) and Afternoon/Night (2:00 PM – 5:00 AM next day).
  - **Day-Level Habit Analytics:** Start and end times in "Estadísticas y Métricas" represent true day-level habits (first session start and last session finish of each logical day) across weekdays and weekends.
  - **Multi-Day Tracking:** Sessions that cross calendar dates display explicit `+1d` or `+Nd` indicators with explanatory tooltips.

## 4. Design Philosophy for Future Modifications

* **Clarity Over Complexity in UI:** No matter how complex the backend parsing becomes, the HTML output must remain jargon-free and localized in Spanish.
* **Aggregated Logging & Interval Merging:** Never log raw network noise. Always group concurrent connections by device and session state, and merge overlapping time intervals to keep historical records clean and mathematically sound.
* **Resiliency:** The system should assume network interruptions, router timeouts, and abrupt client disconnects will happen, and handle them gracefully without losing the session's start time.
