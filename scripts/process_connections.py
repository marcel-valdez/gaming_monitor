import sys
import re
import json
import os
import time

class ConnectionProcessor:
    ACTIVE_THRESHOLD_SECS = 300
    SIGNIFICANT_INACTIVE_SECS = 1800
    MAX_EXPIRY_SECS = 432000  # 5 days

    DEVICE_MAP = {
        '192.168.100.37': 'Phone',
        '192.168.100.66': 'PC'
    }

    def __init__(self, state_file='state.json'):
        self.state_file = state_file
        self.state = self.load_state()

    def load_state(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}

    def save_state(self):
        with open(self.state_file, 'w') as f:
            json.dump(self.state, f)

    def parse_expiry_to_secs(self, expiry_str):
        # Format: "X days, HH:MM:SS"
        match = re.search(r'(\d+)\s+days,\s+(\d{2}):(\d{2}):(\d{2})', expiry_str)
        if match:
            days, hours, mins, secs = map(int, match.groups())
            return (days * 86400) + (hours * 3600) + (mins * 60) + secs
        return 0

    def extract_connections(self, output):
        connections = []
        lines = output.splitlines()
        for i, line in enumerate(lines):
            # Look for Roblox IP
            if '128.116.' in line:
                # The connection info (proto, expiry) is usually in the PREVIOUS line or current line
                # Based on the format seen in sample:
                # tcp ... expiry ...
                #    INIT: ...
                
                # Check current and previous lines for protocol and expiry
                potential_info_lines = [lines[i-1] if i > 0 else "", line]
                
                proto = None
                expiry_secs = None
                device = None
                
                # Identify device from the INIT line (which contains 128.116 usually)
                for ip, alias in self.DEVICE_MAP.items():
                    if ip in line:
                        device = alias
                        break
                
                # If IP not found in the line with 128.116, check the preceding line just in case
                if not device and i > 0:
                    for ip, alias in self.DEVICE_MAP.items():
                        if ip in lines[i-1]:
                            device = alias
                            break

                if not device: continue

                for info_line in potential_info_lines:
                    # Proto match
                    proto_match = re.search(r'^(tcp|udp)', info_line, re.IGNORECASE)
                    if proto_match:
                        proto = proto_match.group(1).upper()
                    
                    # Expiry match
                    if 'days,' in info_line:
                        expiry_secs = self.parse_expiry_to_secs(info_line)
                
                if proto and expiry_secs is not None:
                    connections.append({
                        'device': device,
                        'proto': proto,
                        'expiry': expiry_secs
                    })
        
        # Aggregate: Only keep the LOWEST inactive time (highest expiry) per device_proto
        aggregated = {}
        for conn in connections:
            key = f"{conn['device']}_{conn['proto']}"
            if key not in aggregated or conn['expiry'] > aggregated[key]['expiry']:
                aggregated[key] = conn
                
        return list(aggregated.values())

    def process(self, current_connections, current_time=None, initial_run=False):
        if current_time is None:
            current_time = int(time.time())
        
        actions = []
        found_keys = set()

        for conn in current_connections:
            device = conn['device']
            proto = conn['proto']
            expiry = conn['expiry']
            key = f"{device}_{proto}"
            found_keys.add(key)
            
            inactive_secs = self.MAX_EXPIRY_SECS - expiry
            display_name = f"{device} - Roblox"
            
            # Ensure state exists
            if key not in self.state:
                self.state[key] = {'state': 'DISCOVERED', 'prev_inactive': inactive_secs}

            prev_state = self.state[key].get('state')
            prev_inactive = self.state[key].get('prev_inactive', self.MAX_EXPIRY_SECS)

            if inactive_secs < self.ACTIVE_THRESHOLD_SECS:
                # State is ACTIVE
                if prev_state != 'ACTIVE':
                    self.state[key]['state'] = 'ACTIVE'
                    self.state[key]['session_start'] = current_time
                    actions.append({
                        'type': 'LOG',
                        'device': display_name,
                        'proto': proto,
                        'state': 'ACTIVE',
                        'msg': 'Session started.'
                    })
                    
                    # Notification logic
                    if not initial_run:
                        if prev_inactive >= self.SIGNIFICANT_INACTIVE_SECS:
                            actions.append({
                                'type': 'NOTIFY',
                                'title': 'Roblox Monitor',
                                'body': f"[{device}] {proto} Session Resumed after >30m"
                            })
                        elif prev_state == 'DISCOVERED' or prev_state == 'OFFLINE':
                            actions.append({
                                'type': 'NOTIFY',
                                'title': 'Roblox Monitor',
                                'body': f"[{device}] New {proto} Session Started"
                            })
            else:
                # State is IDLE
                if prev_state == 'ACTIVE':
                    self.state[key]['state'] = 'IDLE'
                    start_time = self.state[key].get('session_start', current_time)
                    duration = current_time - start_time
                    actions.append({
                        'type': 'LOG',
                        'device': display_name,
                        'proto': proto,
                        'state': 'IDLE',
                        'msg': f"Session ended. Total Duration: {duration}s."
                    })
                    del self.state[key]['session_start']
                elif prev_state == 'DISCOVERED':
                    self.state[key]['state'] = 'IDLE'

            self.state[key]['prev_inactive'] = inactive_secs

        # Handle OFFLINE (connections that disappeared)
        for key in list(self.state.keys()):
            if key not in found_keys:
                if self.state[key]['state'] == 'ACTIVE':
                    # Transition to IDLE first if it was active
                    device, proto = key.split('_')
                    start_time = self.state[key].get('session_start', current_time)
                    duration = current_time - start_time
                    actions.append({
                        'type': 'LOG',
                        'device': f"{device} - Roblox",
                        'proto': proto,
                        'state': 'IDLE',
                        'msg': f"Session ended (connection lost). Total Duration: {duration}s."
                    })
                self.state[key]['state'] = 'OFFLINE'
                self.state[key]['prev_inactive'] = self.MAX_EXPIRY_SECS

        self.save_state()
        return actions

if __name__ == "__main__":
    # Orchestrator usage:
    # cat router_output.txt | python3 process_connections.py [initial_run_flag]
    processor = ConnectionProcessor()
    raw_output = sys.stdin.read()
    initial_run = len(sys.argv) > 1 and sys.argv[1] == '--initial'
    
    conns = processor.extract_connections(raw_output)
    actions = processor.process(conns, initial_run=initial_run)
    print(json.dumps(actions))
