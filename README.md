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
                  |   monitor_roblox_connections.sh   |  <-- Runs every 60s
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

1. **The Monitor (`monitor_roblox_connections.sh`):** Automates a Telnet session to the primary gateway router using `expect`, extracts the active connection tables, and writes state events to the log file.
2. **The Data Generator (`generate_roblox_data.sh`):** Watches the log file and uses `awk` to process session state. Instead of building HTML, it outputs a clean `public/data.json` array.
3. **The Web Frontend (`public/`):** A modern, decoupled web application (`index.html`, `style.css`, `app.js`) that fetches data via AJAX and renders the UI dynamically.
4. **The Server (`start_server.sh`):** A helper script that launches a lightweight HTTP server (using Python or PHP) to host the dashboard.

---

## ✨ Features

- **Decoupled Architecture:** Clean separation between shell-based data processing and the web-based UI.
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

When the monitoring script queries the router using `display connection IP <device_ip>`, the router returns connection entries in the following format:
```text
udp ... 4 days, 23:55:00 ... 192.168.100.37:XXXX --> 128.116.X.X:XXXX
```

The script parses this expiration time ($T_{\text{expiry}}$) using Bash regex and computes the inactive duration ($T_{\text{inactive}}$) using the formula:
$$T_{\text{inactive}} = 5\text{ days} - T_{\text{expiry}}$$

- If $T_{\text{inactive}} < 5\text{ minutes}$ (300 seconds), the session is marked as **ACTIVE**.
- If $T_{\text{inactive}} \ge 5\text{ minutes}$, the session is marked as **IDLE**.
- If the connection disappears entirely from the table (or exceeds 5 days), the device is marked **OFFLINE**.

### 2. AWK State Machine Reporter
The reporter script parses `roblox_connections.log` chronologically. It employs a state machine inside `awk` that pairs `ACTIVE` and `IDLE` events for the same device and protocol key (`Device_Protocol`):
- Upon finding an `ACTIVE` state, it marks the start boundary of a session.
- Upon finding an `IDLE` state, it checks if a corresponding active session was tracking, calculates the total active elapsed time, and outputs a formatted record.
- Any session that has an `ACTIVE` event but no succeeding `IDLE` event is treated as **currently active** (`🟢 Activa`) and dynamically calculated relative to the host machine's current system time.

---

## 📋 Prerequisites & Requirements

- **Shell environment:** `bash` version 4.0 or higher (required for associative arrays).
- **Network utilities:** `telnet` and `expect` (for router command automation).
- **Gateway access:** A router located at `192.168.100.1` supporting connection-table display commands (e.g., Huawei WAP gateways).
- **Notifications (Optional):** `notify-send` (libnotify) for desktop environments, `tmux-notify` for tmux integration.
- **Instant Reporting (Optional):** `inotify-tools` (specifically `inotifywait`) to trigger report generation instantly when the log updates.

To install dependencies on Debian/Ubuntu-based systems:
```bash
sudo apt-get update
sudo apt-get install expect telnet inotify-tools libnotify-bin
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

For continuous monitoring, it is recommended to run the services in the background (e.g., inside a `tmux` session, `screen`, or as systemd services).

### Step 1: Start the Connection Monitor
This daemon queries your gateway router every 60 seconds and records state changes.
```bash
./monitor_roblox_connections.sh
```

### Step 2: Start the JSON Data Generator
This daemon watches `roblox_connections.log` and automatically updates the JSON data on every change.
```bash
./generate_roblox_data.sh
```

### Step 3: Start the Web Server
Launch the lightweight HTTP server to serve the dashboard.
```bash
./start_server.sh
```
*The dashboard will be available at:* `http://localhost:8080`

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
