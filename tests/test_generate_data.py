import unittest
import os
import sys
import json
from datetime import datetime

# Add scripts to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts')))

from generate_data import DataGenerator

class TestDataGenerator(unittest.TestCase):
    def setUp(self):
        self.log_file = 'test_roblox_connections.log'
        self.data_file = 'test_data.json'
        if os.path.exists(self.log_file):
            os.remove(self.log_file)
        if os.path.exists(self.data_file):
            os.remove(self.data_file)
        self.generator = DataGenerator(log_file=self.log_file, data_file=self.data_file)

    def tearDown(self):
        if os.path.exists(self.log_file):
            os.remove(self.log_file)
        if os.path.exists(self.data_file):
            os.remove(self.data_file)

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

if __name__ == '__main__':
    unittest.main()
