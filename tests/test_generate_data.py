import unittest
import os
import sys
import json
import tempfile
from datetime import datetime

# Add scripts to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts')))

from generate_data import DataGenerator

class TestDataGenerator(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.log_file = os.path.join(self.test_dir.name, 'roblox_connections.log')
        self.data_file = os.path.join(self.test_dir.name, 'data.json')
        self.generator = DataGenerator(log_file=self.log_file, data_file=self.data_file)

    def tearDown(self):
        self.test_dir.cleanup()

    def test_parse_log_and_generate_json(self):
        # Sample log content based on existing format
        # Use ISO format or explicitly match the parser regex
        log_content = """[2026-08-08 10:00:00] | Phone - Roblox | UDP | ACTIVE   | Session started.
[2026-08-08 10:05:00] | Phone - Roblox | UDP | IDLE     | Session ended. Total Duration: 300s.
[2026-08-08 10:10:00] | PC - Roblox    | TCP | ACTIVE   | Session started.
"""
        with open(self.log_file, 'w') as f:
            f.write(log_content)

        # Mock current time for "Activa" sessions
        # Need to ensure this is relative to the log timestamps
        start_dt = datetime.strptime('2026-08-08 10:10:00', '%Y-%m-%d %H:%M:%S')
        now_dt = datetime.strptime('2026-08-08 10:15:00', '%Y-%m-%d %H:%M:%S')
        
        self.generator.get_current_time = lambda: int(now_dt.timestamp())
        
        self.generator.generate()

        with open(self.data_file, 'r') as f:
            data = json.load(f)

        # print(f"DEBUG DATA: {json.dumps(data, indent=2)}")

        self.assertEqual(len(data), 2)
        
        # Phone session (Ended)
        phone_session = next(s for s in data if s['device'] == 'Phone')
        self.assertEqual(phone_session['duration_sec'], 300)
        self.assertEqual(phone_session['duration_str'], '5m 0s')
        self.assertEqual(phone_session['end_time_fmt'], '10:05 AM')
        # Note: Depending on implementation of date formatting, this might need adjustment for exact match
        self.assertIn('08 de agosto de 2026', phone_session['date'])

        # PC session (Active)
        pc_session = next(s for s in data if s['device'] == 'PC')
        self.assertEqual(pc_session['end_time_fmt'], '🟢 Activa')
        self.assertEqual(pc_session['duration_sec'], 300) # 10:15 - 10:10 = 5 mins

    def test_session_stitching_within_gap(self):
        """Verify that micro-sessions within gap_threshold (<=300s) are stitched into one session."""
        log_content = """[2026-09-06 18:39:32] | PC - Roblox | UDP | ACTIVE | Session started.
[2026-09-06 18:40:40] | PC - Roblox | UDP | IDLE   | Session ended. Total Duration: 68s.
[2026-09-06 18:44:03] | PC - Roblox | UDP | ACTIVE | Session started.
[2026-09-06 18:45:12] | PC - Roblox | UDP | IDLE   | Session ended. Total Duration: 69s.
[2026-09-06 18:49:43] | PC - Roblox | UDP | ACTIVE | Session started.
[2026-09-06 18:50:51] | PC - Roblox | UDP | IDLE   | Session ended. Total Duration: 68s.
"""
        with open(self.log_file, 'w') as f:
            f.write(log_content)

        self.generator.generate()

        with open(self.data_file, 'r') as f:
            data = json.load(f)

        # 3 micro-sessions within ~3-4 minute gaps should stitch into 1 single session
        self.assertEqual(len(data), 1)
        session = data[0]
        self.assertEqual(session['device'], 'PC')
        self.assertEqual(session['proto'], 'UDP')
        self.assertEqual(session['start_time_fmt'], '6:39 PM')
        self.assertEqual(session['end_time_fmt'], '6:50 PM')
        # Total duration: 18:50:51 - 18:39:32 = 679s (11m 19s)
        self.assertEqual(session['duration_sec'], 679)
        self.assertEqual(session['duration_str'], '11m 19s')

    def test_session_stitching_exceeds_gap(self):
        """Verify that sessions separated by > gap_threshold remain distinct."""
        log_content = """[2026-09-06 10:00:00] | PC - Roblox | UDP | ACTIVE | Session started.
[2026-09-06 10:05:00] | PC - Roblox | UDP | IDLE   | Session ended. Total Duration: 300s.
[2026-09-06 10:20:00] | PC - Roblox | UDP | ACTIVE | Session started.
[2026-09-06 10:30:00] | PC - Roblox | UDP | IDLE   | Session ended. Total Duration: 600s.
"""
        with open(self.log_file, 'w') as f:
            f.write(log_content)

        self.generator.generate()

        with open(self.data_file, 'r') as f:
            data = json.load(f)

        # Gap is 15 minutes (900s > 300s), so they should remain 2 separate sessions
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]['duration_sec'], 300)
        self.assertEqual(data[1]['duration_sec'], 600)

    def test_different_devices_and_protocols_isolated(self):
        """Verify that stitching is isolated by (device, proto)."""
        log_content = """[2026-09-06 10:00:00] | PC - Roblox    | UDP | ACTIVE | Session started.
[2026-09-06 10:00:00] | PC - Roblox    | TCP | ACTIVE | Session started.
[2026-09-06 10:00:00] | Phone - Roblox | UDP | ACTIVE | Session started.
[2026-09-06 10:02:00] | PC - Roblox    | UDP | IDLE   | Session ended. Total Duration: 120s.
[2026-09-06 10:02:00] | PC - Roblox    | TCP | IDLE   | Session ended. Total Duration: 120s.
[2026-09-06 10:02:00] | Phone - Roblox | UDP | IDLE   | Session ended. Total Duration: 120s.
"""
        with open(self.log_file, 'w') as f:
            f.write(log_content)

        self.generator.generate()

        with open(self.data_file, 'r') as f:
            data = json.load(f)

        # Even though they happen simultaneously, they are 3 distinct streams
        self.assertEqual(len(data), 3)
        streams = {(s['device'], s['proto']) for s in data}
        self.assertEqual(streams, {('PC', 'UDP'), ('PC', 'TCP'), ('Phone', 'UDP')})

    def test_active_session_merges_with_recent_completed(self):
        """Verify that an ongoing active session merges with a completed session within gap."""
        log_content = """[2026-09-06 10:00:00] | Phone - Roblox | UDP | ACTIVE | Session started.
[2026-09-06 10:05:00] | Phone - Roblox | UDP | IDLE   | Session ended. Total Duration: 300s.
[2026-09-06 10:08:00] | Phone - Roblox | UDP | ACTIVE | Session started.
"""
        with open(self.log_file, 'w') as f:
            f.write(log_content)

        # Mock current time at 10:15:00 (15 minutes after 10:00)
        now_dt = datetime.strptime('2026-09-06 10:15:00', '%Y-%m-%d %H:%M:%S')
        self.generator.get_current_time = lambda: int(now_dt.timestamp())

        self.generator.generate()

        with open(self.data_file, 'r') as f:
            data = json.load(f)

        # 10:00-10:05 completed merged into the 10:08 active session (gap is 3m <= 300s)
        self.assertEqual(len(data), 1)
        active_session = data[0]
        self.assertEqual(active_session['end_time_fmt'], '🟢 Activa')
        self.assertEqual(active_session['start_time_fmt'], '10:00 AM')
        # Total duration from 10:00 to 10:15 = 15m = 900s
        self.assertEqual(active_session['duration_sec'], 900)
        self.assertEqual(active_session['duration_str'], '15m 0s')

    def test_isolated_short_session_preserved(self):
        """Verify that isolated short sessions (<120s) without neighbors are retained for evasion detection."""
        log_content = """[2026-09-06 02:00:00] | PC - Roblox | UDP | ACTIVE | Session started.
[2026-09-06 02:01:08] | PC - Roblox | UDP | IDLE   | Session ended. Total Duration: 68s.
"""
        with open(self.log_file, 'w') as f:
            f.write(log_content)

        self.generator.generate()

        with open(self.data_file, 'r') as f:
            data = json.load(f)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['duration_sec'], 68)
        self.assertEqual(data[0]['duration_str'], '1m 8s')

    def test_cross_day_session_days_diff(self):
        """Verify that sessions that cross into subsequent calendar days include days_diff."""
        log_content = """[2026-09-03 14:39:34] | PC - Roblox | TCP | ACTIVE | Session started.
[2026-09-05 01:38:13] | PC - Roblox | TCP | IDLE   | Session ended. Total Duration: 125919s.
"""
        with open(self.log_file, 'w') as f:
            f.write(log_content)

        self.generator.generate()

        with open(self.data_file, 'r') as f:
            data = json.load(f)

        self.assertEqual(len(data), 1)
        session = data[0]
        self.assertEqual(session['days_diff'], 2)
        self.assertEqual(session['start_time_fmt'], '2:39 PM')
        self.assertEqual(session['end_time_fmt'], '1:38 AM')

if __name__ == '__main__':
    unittest.main()

