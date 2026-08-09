import json
import re
import os
import time
from datetime import datetime

class DataGenerator:
    # Spanish month mapping
    SPANISH_MONTHS = {
        1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
        5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
        9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
    }

    def __init__(self, log_file='roblox_connections.log', data_file='public/data.json'):
        self.log_file = log_file
        self.data_file = data_file

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
                    key = f"{device}_{proto}"

                    if 'ACTIVE' in state:
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
                        session['duration_sec'] = duration_sec
                        session['duration_str'] = self.format_duration(duration_sec)
                        completed_sessions.append(session)

        # Handle currently active sessions
        current_time = self.get_current_time()
        for key, session in sessions.items():
            duration_sec = current_time - session['start_epoch']
            if duration_sec < 0: duration_sec = 0
            
            session['end'] = "🟢 Activa"
            session['end_time_fmt'] = "🟢 Activa"
            session['duration_sec'] = duration_sec
            session['duration_str'] = self.format_duration(duration_sec)
            completed_sessions.append(session)

        # Sort by start_epoch
        completed_sessions.sort(key=lambda x: x['start_epoch'])

        # Ensure directory exists
        dir_name = os.path.dirname(self.data_file)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        
        with open(self.data_file, 'w') as f:
            json.dump(completed_sessions, f, indent=2)

if __name__ == "__main__":
    generator = DataGenerator()
    generator.generate()
    print(f"[{datetime.now().strftime('%H:%M:%S')}] JSON data updated -> {generator.data_file}")
