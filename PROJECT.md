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
The most critical function of the system is to distinguish between a game being left open in the background (menus, chat, matchmaking) and active, hands-on gameplay. Future iterations must preserve the logic that maps reliable connections (TCP) to "Idle/Menus" and connectionless, high-tick-rate streams (UDP) to "Active Gameplay."
* **Ensure Accountability and Catch Evasion:**
The system must account for abrupt, evasive actions—such as a "panic quit" (slamming a laptop shut or pulling a power cord to avoid getting caught). The logging architecture must reliably identify these ghost sessions and record the exact time the physical activity ceased.
* **Maintain Device-Level Attribution:**
Because the household utilizes multiple devices (e.g., a PC and a smartphone/secondary network), the system must aggregate and attribute gaming sessions to the correct physical device. This prevents overlapping network sessions from inflating playtime or causing notification fatigue.
* **Provide Zero-Interaction Monitoring:**
The system must operate entirely in the background as a headless daemon. It must proactively alert the administrator when boundaries are crossed (e.g., a session resuming after a significant break or a brand-new session starting) without requiring manual polling.
* **Deliver a "Source of Truth" Dashboard:**
The final HTML report must act as an indisputable ledger of screen time. It must group fragmented micro-connections into clean, logical "sessions," update in real-time, and present the data visually so that enforcing household rules around gaming time is based on objective data rather than guesswork.

## 4. Design Philosophy for Future Modifications

* **Clarity Over Complexity in UI:** No matter how complex the backend parsing becomes, the HTML output must remain jargon-free.
* **Aggregated Logging:** Never log raw network noise. Always group concurrent connections by device and session state to keep historical records clean.
* **Resiliency:** The system should assume network interruptions, router timeouts, and abrupt client disconnects will happen, and handle them gracefully without losing the session's start time.
