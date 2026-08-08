# Roblox Activity Monitor & HTML Reporter 🎮📊

A lightweight, non-invasive activity monitoring and analytics system for Roblox sessions. By inspecting connection state tables directly from a Huawei/WAP gateway router, this project monitors when specific local devices (PC and Phone) are connected to Roblox servers, distinguishes gameplay from lobby/chat menus, sends desktop notifications on new/resumed sessions, and provides a modern web-based dashboard served via a local HTTP server.

---

## 🏗️ Architecture Overview

The system is decoupled into three main components:

```
                       +-----------------------------+
                       |   Huawei Gateway Router     |
                       |       (192.168.100.1)       |
                       +--------------+--------------+
                                      |
                             Telnet Query (Expect)
                                      |
                                      v
                  +-----------------------------------+
                  |   monitor_roblox_connections.sh   |  <-- Orchestrator
                  |  (Calls scripts/process_connections.py)
                  +------------------+----------------+
                                     |
                         Appends state-change logs
                                     |
                                     v
                        +-------------------------+
                        |  roblox_connections.log |
                        +------------+------------+
                                     |
                            inotifywait / polling
                                     |
                                     v
                  +-----------------------------------+
                  |     generate_roblox_data.sh       |  <-- Backend Daemon
                  |  (Calls scripts/generate_data.py) |
                  +------------------+----------------+
                                     |
                           Generates public/data.json
                                     |
                                     v
                  +-----------------------------------+
                  |        start_server.sh            |  <-- HTTP Server
                  |    (Serves the public/ folder)    |
                  +------------------+----------------+
                                     |
                        Static HTML/JS UI (AJAX)
                                     |
                                     v
                        +-------------------------+
                        |    Browser Dashboard    |  <-- http://localhost:8080
                        +-------------------------+
```

1. **The Monitor (`monitor_roblox_connections.sh`):** Automates a Telnet session to the primary gateway router. It delegates state management and connection analysis to **`scripts/process_connections.py`**, which maintains session state in `state.json`.
2. **The Data Generator (`generate_roblox_data.sh`):** Watches the log file and uses **`scripts/generate_data.py`** to process session history and output a clean `public/data.json`.
3. **The Web Frontend (`public/`):** A modern web application that fetches data via AJAX and renders the UI dynamically.
4. **The Server (`start_server.sh`):** A helper script that launches a lightweight HTTP server to host the dashboard.

---

## ✨ Features

- **Python-Powered Logic:** Business logic (parsing, duration calculation, state machine) is extracted into Python for better maintainability and testability.
- **Robust State Management:** Session tracking is persisted in `state.json`, ensuring consistency across restarts.
- **Comprehensive Test Suite:** Includes unit and integration tests to verify the entire data pipeline.
- **Decoupled Architecture:** Clean separation between shell-based I/O and Python-based business logic.
- **Non-Invasive Tracking:** No software or agent needs to be installed on the PC or Phone being monitored.
- **Smart Protocol Mapping:** 
  - **UDP Connections** $\rightarrow$ mapped to **🎮 Gameplay (Active)**.
  - **TCP Connections** $\rightarrow$ mapped to **⚙️ Menus, Lobby, or Chat**.
- **Real-Time AJAX Updates:** The dashboard fetches `data.json` every 5 seconds without reloading the page.
- **Live JavaScript Timers:** Active sessions show a ticking clock incremented second-by-second in the browser.
- **Desktop Notifications:** Integrated alerts for session starts and significant resumptions.

---

## ⚙️ How It Works (Under the Hood)

### 1. Connection Tracking Heuristics
The router gateway tracks active UDP and TCP connections with an expiration countdown timer. 
For a standard Huawei/WAP gateway, an inactive/idle NAT translation has a default maximum lifetime of **5 days** (432,000 seconds).

The Python logic in `process_connections.py` parses the expiration time ($T_{\text{expiry}}$) and computes the inactive duration ($T_{\text{inactive}}$):
$$T_{\text{inactive}} = 5\text{ days} - T_{\text{expiry}}$$

- If $T_{\text{inactive}} < 5\text{ minutes}$ (300 seconds), the session is marked as **ACTIVE**.
- If $T_{\text{inactive}} \ge 5\text{ minutes}$, the session is marked as **IDLE**.
- If the connection disappears from the table, it eventually transitions to **OFFLINE**.

### 2. Python Reporter State Machine
The `generate_data.py` script parses `roblox_connections.log` chronologically. It pairs `ACTIVE` and `IDLE` events for the same device and protocol to calculate precise session durations and formats the output with Spanish locale support for the dashboard.

---

## 📋 Prerequisites & Requirements

- **Python 3.x:** Required for core business logic.
- **Shell environment:** `bash` version 4.0 or higher.
- **Utilities:** `telnet`, `expect`, `jq`, and `inotify-tools`.
- **Notifications (Optional):** `notify-send` and `tmux-notify`.

To install dependencies:
```bash
sudo apt-get install python3 expect telnet inotify-tools libnotify-bin jq
```

---

## 🚀 Installation & Setup

1. **Clone or copy the scripts** into your preferred directory (e.g., `~/gaming-notifier`).
2. **Make the scripts executable**:
   ```bash
   chmod +x monitor_roblox_connections.sh generate_roblox_report.sh
   ```
3. **Verify Configuration:**
   Open `monitor_roblox_connections.sh` and verify the IP variables to match your network configuration:
   - Gateway IP: `192.168.100.1`
   - Target Device IPs:
     - **Phone:** `192.168.100.37`
     - **PC:** `192.168.100.66`
   - Gateway Credentials (inside the `expect` block):
     - `Login: "root"`
     - `Password: "adminHW"`

---

## 🏃 Running the Services

The most reliable way to run the system is using the included **Master Supervisor**. This script manages the three core services, handles independent failures, and implements an exponential backoff (up to 5 minutes) to ensure high availability.

```bash
./start_all.sh
```

This single command starts:
1.  **Monitor:** Queries the router every 60s.
2.  **Data Generator:** Converts logs to `public/data.json` in real-time.
3.  **Web Server:** Hosts the dashboard at `http://localhost:8080`.

*Note: Press `Ctrl+C` to gracefully stop all background services at once.*

---

## 📂 Log Format Definition

All states are captured in `roblox_connections.log` in a clean, anonymized (no external IP addresses logged), bar-separated format:

```text
[Timestamp] | Device Alias - Roblox | Protocol | State | Message
```

**Example logs:**
```text
[2026-08-08 14:15:20] | PC - Roblox      | TCP | ACTIVE | Session started.
[2026-08-08 14:25:10] | Phone - Roblox   | UDP | ACTIVE | Session started.
[2026-08-08 14:30:15] | PC - Roblox      | TCP | IDLE   | Session ended. Total Duration: 895s.
```

---

## 🖥️ Dashboard UI Preview

The generated `reporte_roblox.html` uses an ultra-clean, Apple-style responsive card design. Here is a visual representation of how the dashboard organizes activity:

```
+-------------------------------------------------------------+
|               Reporte de Actividad de Roblox                |
|          Un resumen consolidado del tiempo de juego         |
+-------------------------------------------------------------+

 📅 08 de agosto de 2026
 +-----------------------------------------------------------+
 | Dispositivo | Tipo de Actividad     | Inicio   | Fin      | Tiempo |
 +-------------+-----------------------+----------+----------+--------+
 | 📱 Celular  | 🎮 Jugando (Activo)   | 02:25 PM | 🟢Activa | 7m 12s | <-- Counts up live!
 | 💻 PC       | ⚙️ Menús / Chat       | 02:15 PM | 02:30 PM | 14m 55s|
 +-----------------------------------------------------------+
```

---

## 🔒 Security & Privacy Notes

- **Credential Storage:** Router login details are stored inside the `monitor_roblox_connections.sh` script. Ensure this file's permissions are restricted to your local user (`chmod 700 monitor_roblox_connections.sh`).
- **Data Minimization:** No actual game content, chats, usernames, or destination IP addresses are logged. The script strictly records the local device alias, connection protocol, activity state, and session duration.
