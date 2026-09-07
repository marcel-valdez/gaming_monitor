import unittest
import os
import sys
import json
import time
import tempfile
from datetime import datetime

# Add scripts to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts')))

from process_connections import ConnectionProcessor
from generate_data import DataGenerator

class TestDataPipelineIntegration(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.state_file = os.path.join(self.test_dir.name, 'integration_state.json')
        self.log_file = os.path.join(self.test_dir.name, 'integration_roblox.log')
        self.data_file = os.path.join(self.test_dir.name, 'integration_data.json')
        self.processor = ConnectionProcessor(state_file=self.state_file)
        self.generator = DataGenerator(log_file=self.log_file, data_file=self.data_file)

    def tearDown(self):
        self.test_dir.cleanup()

    def log_action(self, action):
        """Simulate the Bash orchestrator's logging role."""
        if action['type'] == 'LOG':
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            log_line = f"[{timestamp}] | {action['device']} | {action['proto']} | {action['state']} | {action['msg']}\n"
            with open(self.log_file, 'a') as f:
                f.write(log_line)

    def test_full_pipeline(self):
        # 1. Simulate "ACTIVE" connection detected via Telnet
        # 432000 - 431900 = 100s inactive (< 300s threshold)
        telnet_output_active = """
udp          [REPLIED]           0                                            4 days, 23:58:20             N/A
    INIT: 192.168.100.37:35798 - 128.116.1.1:53  RESP: 128.116.1.1:53 - 192.168.100.37:35798
"""
        conns = self.processor.extract_connections(telnet_output_active)
        actions = self.processor.process(conns, initial_run=False)
        
        for action in actions:
            self.log_action(action)
            
        # Verify log has the active entry
        with open(self.log_file, 'r') as f:
            lines = f.readlines()
            self.assertTrue(any("ACTIVE" in l for l in lines))

        # 2. Advance time and simulate "IDLE" connection
        # We'll use a small sleep to ensure a measurable duration
        time.sleep(1.1) 
        
        # 432000 - 431000 = 1000s inactive (> 300s threshold)
        telnet_output_idle = """
udp          [REPLIED]           0                                            4 days, 23:50:00             N/A
    INIT: 192.168.100.37:35798 - 128.116.1.1:53  RESP: 128.116.1.1:53 - 192.168.100.37:35798
"""
        conns = self.processor.extract_connections(telnet_output_idle)
        actions = self.processor.process(conns, initial_run=False)
        
        for action in actions:
            self.log_action(action)

        # 3. Generate the JSON data
        self.generator.generate()
        
        # 4. Verify the final data.json
        self.assertTrue(os.path.exists(self.data_file))
        with open(self.data_file, 'r') as f:
            data = json.load(f)
            
        self.assertEqual(len(data), 1)
        session = data[0]
        self.assertEqual(session['device'], 'Phone')
        self.assertEqual(session['proto'], 'UDP')
        self.assertGreaterEqual(session['duration_sec'], 1)
        self.assertIn('s', session['duration_str'])
        
        # Verify Spanish date format (e.g., "08 de agosto de 2026")
        self.assertRegex(session['date'], r'\d{2} de \w+ de 202\d')
        
        # Verify time format (e.g. "10:00 AM")
        self.assertRegex(session['start_time_fmt'], r'\d{1,2}:\d{2} (AM|PM)')

if __name__ == '__main__':
    unittest.main()
