import json
import re
import os
import time
from datetime import datetime

class DataGenerator:
    """
    Generates structured dashboard JSON (public/data.json) from connection logs.

    ==============================================================================
    ROBLOX NETWORKING ARCHITECTURE & SESSION STITCHING RATIONALE
    ==============================================================================
    Roblox does not expose raw POSIX sockets to developers; its networking layer
    is built upon an engine-level abstraction (historically RakNet) operating over
    dynamic UDP ports (49152-65535).
    
    Key Engine Classes & Mechanisms:
    1. NetworkClient & NetworkServer:
       - NetworkClient (https://create.roblox.com/docs/reference/engine/classes/NetworkClient)
         runs on the client, managing the active UDP handshake with the game server.
         When a handshake succeeds, ConnectionAccepted(peer, replicator) binds a
         ClientReplicator to the server endpoint (IP|Port).
    2. NetworkReplicator (ClientReplicator / ServerReplicator):
       - NetworkReplicator (https://create.roblox.com/docs/reference/engine/classes/NetworkReplicator)
         handles continuous delta replication of instances, physics, and remote events.
    3. RunService.Heartbeat:
       - Network serialization runs immediately following the physics step in the
         frame loop (RunService.Heartbeat). During active gameplay, high-frequency
         UDP datagrams (~60 Hz) flow steadily, keeping the router's NAT connection
         tracking (conntrack) timer refreshed (0s inactive).
    4. UnreliableRemoteEvent vs RemoteEvent:
       - Whether scripts dispatch raw unsequenced datagrams (UnreliableRemoteEvent)
         or reliable sequenced RPCs (RemoteEvent / RemoteFunction), both are
         multiplexed over the same underlying UDP socket managed by NetworkClient.

    Why Session Stitching (DEFAULT_GAP_THRESHOLD = 300s) Is Necessary:
    - Multi-place experiences & teleports: Players frequently transition between
      lobbies, matchmaking queues, and mini-games (e.g., Blox Fruits, BedWars).
      Each teleport tears down the old NetworkClient UDP connection and negotiates
      a new handshake with a different game server.
    - Asset loading & intermission: While new place assets load over HTTPS/TCP,
      gameplay UDP traffic temporarily drops.
    - Router Conntrack Jitter: The router's NAT table counts down inactivity.
      When idle time crosses the monitor's 300s threshold during a 2-4 minute
      teleport or intermission, the monitor logs an IDLE event. When the next place
      loads, UDP packets resume, logging ACTIVE. Without stitching, one continuous
      2-hour gaming session fragments into dozens of ~68-second micro-sessions.
    - An empirical gap threshold of 300 seconds (5 minutes) bridges these server-hop
      and loading intervals into coherent logical sessions while preserving genuine
      breaks and catching brief standalone 'panic quits' (<120s).
    ==============================================================================
    """

    # Spanish month mapping
    SPANISH_MONTHS = {
        1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
        5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
        9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
    }

    # Default gap threshold: 300 seconds (5 minutes)
    DEFAULT_GAP_THRESHOLD = 300

    def __init__(self, log_file='roblox_connections.log', data_file='public/data.json', gap_threshold=None):
        self.log_file = log_file
        self.data_file = data_file
        if gap_threshold is not None:
            self.gap_threshold = int(gap_threshold)
        else:
            self.gap_threshold = int(os.getenv("SESSION_GAP_THRESHOLD", self.DEFAULT_GAP_THRESHOLD))

    def get_current_time(self):
        return int(time.time())

    def format_spanish_date(self, dt):
        return f"{dt.day:02d} de {self.SPANISH_MONTHS[dt.month]} de {dt.year}"

    def format_duration(self, seconds):
        hrs = seconds // 3600
        mins = (seconds % 3600) // 60
        secs = seconds % 60
        parts = []
        if hrs > 0: parts.append(f"{hrs}h")
        if mins > 0 or (hrs > 0 and mins == 0): parts.append(f"{mins}m")
        parts.append(f"{secs}s")
        return " ".join(parts)

    def stitch_sessions(self, completed_sessions, active_sessions):
        """
        Merges consecutive sessions on the same device and protocol if the gap
        between the previous session's end and the next session's start is <= gap_threshold.
        Also merges the latest completed session into an ongoing active session if within gap.
        """
        by_key = {}
        for s in completed_sessions:
            k = f"{s['device']}_{s['proto']}"
            by_key.setdefault(k, []).append(s)

        stitched_completed = []
        current_time = self.get_current_time()

        for k, s_list in by_key.items():
            s_list.sort(key=lambda x: x['start_epoch'])
            stream = []
            for s in s_list:
                if not stream:
                    stream.append(dict(s))
                else:
                    last = stream[-1]
                    gap = s['start_epoch'] - last['end_epoch']
                    if gap <= self.gap_threshold:
                        # Merge s into last
                        last['end'] = s['end']
                        last['end_time_fmt'] = s['end_time_fmt']
                        last['end_epoch'] = max(last['end_epoch'], s['end_epoch'])
                        last['duration_sec'] = last['end_epoch'] - last['start_epoch']
                        last['duration_str'] = self.format_duration(last['duration_sec'])
                        dt_start = datetime.fromtimestamp(last['start_epoch'])
                        dt_end = datetime.fromtimestamp(last['end_epoch'])
                        days_diff = (dt_end.date() - dt_start.date()).days
                        if days_diff > 0:
                            last['days_diff'] = days_diff
                        elif 'days_diff' in last:
                            del last['days_diff']
                    else:
                        stream.append(dict(s))

            # Merge with active session if within gap threshold
            if k in active_sessions and stream:
                last = stream[-1]
                active_s = active_sessions[k]
                gap = active_s['start_epoch'] - last['end_epoch']
                if gap <= self.gap_threshold:
                    active_s['date'] = last['date']
                    active_s['start_time_fmt'] = last['start_time_fmt']
                    active_s['start_epoch'] = last['start_epoch']
                    stream.pop()

            stitched_completed.extend(stream)

        # Append currently active sessions
        final_sessions = list(stitched_completed)
        for k, session in active_sessions.items():
            duration_sec = current_time - session['start_epoch']
            if duration_sec < 0: duration_sec = 0

            session['end'] = "🟢 Activa"
            session['end_time_fmt'] = "🟢 Activa"
            session['duration_sec'] = duration_sec
            session['duration_str'] = self.format_duration(duration_sec)
            final_sessions.append(session)

        # Sort all sessions chronologically by start_epoch
        final_sessions.sort(key=lambda x: x['start_epoch'])
        return final_sessions

    def generate(self):
        if not os.path.exists(self.log_file):
            return

        sessions = {}
        completed_sessions = []

        with open(self.log_file, 'r') as f:
            for line in f:
                # Format: [2026-08-08 10:00:00] | Device - Roblox | PROTO | STATE | MSG
                match = re.search(r'\[(.*?)\]\s*\|\s*(.*?)\s*-\s*Roblox\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|', line)
                if match:
                    timestamp_str, device, proto, state = match.groups()
                    dt = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                    epoch = int(dt.timestamp())
                    key = f"{device.strip()}_{proto}"

                    if 'ACTIVE' in state:
                        # If key is not already active, record new start
                        if key not in sessions:
                            sessions[key] = {
                                'date': self.format_spanish_date(dt),
                                'start_time_fmt': dt.strftime('%I:%M %p').lstrip('0'),
                                'start_epoch': epoch,
                                'proto': proto,
                                'device': device.strip(),
                            }
                    elif 'IDLE' in state and key in sessions:
                        session = sessions.pop(key)
                        duration_sec = epoch - session['start_epoch']
                        if duration_sec < 0: duration_sec = 0

                        session['end'] = dt.strftime('%H:%M:%S')
                        session['end_time_fmt'] = dt.strftime('%I:%M %p').lstrip('0')
                        session['end_epoch'] = epoch
                        session['duration_sec'] = duration_sec
                        session['duration_str'] = self.format_duration(duration_sec)
                        dt_start = datetime.fromtimestamp(session['start_epoch'])
                        days_diff = (dt.date() - dt_start.date()).days
                        if days_diff > 0:
                            session['days_diff'] = days_diff
                        completed_sessions.append(session)

        # Apply session stitching
        processed_sessions = self.stitch_sessions(completed_sessions, sessions)

        # Ensure directory exists
        dir_name = os.path.dirname(self.data_file)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)

        with open(self.data_file, 'w') as f:
            json.dump(processed_sessions, f, indent=2)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate dashboard data from connection log with session stitching")
    parser.add_argument("--log-file", default=os.getenv("LOG_FILE", "roblox_connections.log"), help="Path to input log file")
    parser.add_argument("--data-file", default=os.getenv("DATA_FILE", "public/data.json"), help="Path to output data.json file")
    parser.add_argument("--gap-threshold", type=int, default=int(os.getenv("SESSION_GAP_THRESHOLD", DataGenerator.DEFAULT_GAP_THRESHOLD)),
                        help="Maximum gap in seconds between micro-connections to stitch into a single logical session (default: 300s)")
    args, _ = parser.parse_known_args()

    generator = DataGenerator(log_file=args.log_file, data_file=args.data_file, gap_threshold=args.gap_threshold)
    generator.generate()
    print(f"[{datetime.now().strftime('%H:%M:%S')}] JSON data updated -> {generator.data_file}")

