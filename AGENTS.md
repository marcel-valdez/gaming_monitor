# Project Instructions: Roblox Activity Monitoring System

This project is a non-invasive activity monitoring and analytics system for Roblox sessions.

## 🏛️ Guiding Principles
For the implementation-agnostic guiding principles, core goals, and design philosophy of this system, refer to the following file:

- [PROJECT.md](./PROJECT.md): Foundational mandates regarding the purpose of the system, intended audience, and user use-cases.

## 🛠️ Development Workflows

- **Backend:** Data processing is handled by Bash scripts (`monitor_roblox_connections.sh`, `generate_roblox_data.sh`).
- **Frontend:** The web dashboard is located in the `public/` directory and is built with Vanilla HTML/CSS/JS.
- **Serving:** Use `./start_server.sh` to serve the dashboard locally.

## 📝 Standards
- **Logging:** Anonymize logs; do not store external IP addresses.
- **UI:** Maintain a jargon-free, localized (Spanish) dashboard as outlined in `PROJECT.md`.
- **Accuracy:** Prioritize the distinction between UDP (Active Gameplay) and TCP (Menus/Idle).
