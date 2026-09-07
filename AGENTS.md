# Project Instructions: Roblox Activity Monitoring System

This project is a non-invasive activity monitoring and analytics system for Roblox sessions.

## 🏛️ Guiding Principles
For the implementation-agnostic guiding principles, core goals, and design philosophy of this system, refer to the following files:

- [PROJECT.md](./PROJECT.md): Foundational mandates regarding the purpose of the system, intended audience, and user use-cases.
- [roblox_udp_networking_docs.md](./roblox_udp_networking_docs.md): Technical reference on Roblox engine UDP networking architecture, replication lifecycles, and connection APIs.

## 🛠️ Development Workflows

- **Backend:** Data processing is orchestrated by Bash scripts (`monitor_roblox_connections.sh`, `generate_roblox_data.sh`) calling core Python modules (`scripts/process_connections.py`, `scripts/generate_data.py`).
- **Frontend:** The web dashboard is located in the `public/` directory and is built with Vanilla HTML/CSS/JS.
- **Serving:** Use `./start_server.sh` to serve the dashboard locally.
- **Testing:** Always verify changes using `./run_tests.sh` (which executes Python unit/integration tests, JS unit tests, and JSDOM E2E rendering tests in an isolated sandbox).

## 📝 Standards
- **Logging:** Anonymize logs; do not store external IP addresses.
- **UI:** Maintain a jargon-free, localized (Spanish) dashboard as outlined in `PROJECT.md` (`🎮 En Juego Activo`, `👨‍💻 Total En Juego`).
- **Accuracy & Stitching:** Prioritize the distinction between UDP (Active Gameplay, stitched with 22m TCP-aware gap) and TCP (Total En Juego, stitched with 70m P99 gap).
- **Time Math & Grouping:** Enforce the 5:00 AM logical day rollover, merge overlapping session intervals to avoid duration inflation, and calculate day-level start/end time averages.
