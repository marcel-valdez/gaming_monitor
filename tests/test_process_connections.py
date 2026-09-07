import unittest
import os
import sys
import json
import tempfile

# Add scripts to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts')))

# We will create this class next
from process_connections import ConnectionProcessor

class TestConnectionProcessor(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.state_file = os.path.join(self.test_dir.name, 'state.json')
        # Use a fixed reference time for deterministic tests (if needed)
        self.processor = ConnectionProcessor(state_file=self.state_file)

    def tearDown(self):
        self.test_dir.cleanup()

    def test_parse_expiry(self):
        # Example: 4 days, 07:21:02
        expiry_str = "4 days, 07:21:02"
        expected_secs = (4 * 86400) + (7 * 3600) + (21 * 60) + 2
        self.assertEqual(self.processor.parse_expiry_to_secs(expiry_str), expected_secs)

    def test_parse_router_output(self):
        # Based on testdata/sample_telnet_output.txt format
        sample_output = """
tcp          [ASSURED]           TCP_ESTABLISHED                              4 days, 07:21:02             NAPT
    INIT: 192.168.100.37:50820 - 142.251.219.14:443  RESP: 142.251.219.14:443 - 10.76.185.47:50820
udp          [REPLIED]           0                                            4 days, 23:55:00             N/A
    INIT: 192.168.100.37:35798 - 128.116.1.1:53  RESP: 128.116.1.1:53 - 192.168.100.37:35798
tcp          [ASSURED]           TCP_ESTABLISHED                              4 days, 23:55:00             NAPT
    INIT: 192.168.100.66:35798 - 128.116.1.1:53  RESP: 128.116.1.1:53 - 10.76.185.47:35798
"""
        connections = self.processor.extract_connections(sample_output)
        # print(f"DEBUG: {connections}") # Uncomment if needed
        
        # Should only care about 128.116 connections for Phone (.37) and PC (.66)
        self.assertEqual(len(connections), 2)
        
        # Phone UDP
        phone_conn = next(c for c in connections if c['device'] == 'Phone')
        self.assertEqual(phone_conn['proto'], 'UDP')
        self.assertEqual(phone_conn['expiry'], (4 * 86400) + (23 * 3600) + (55 * 60))
        
        # PC TCP
        pc_conn = next(c for c in connections if c['device'] == 'PC')
        self.assertEqual(pc_conn['proto'], 'TCP')

    def test_state_transitions(self):
        # 1. New active session
        # Mocking current_time and threshold
        # 432000 - 431900 = 100s inactive (< 300s threshold)
        active_conn = {'device': 'PC', 'proto': 'UDP', 'expiry': 431900}
        
        # First run: New session
        actions = self.processor.process([active_conn], current_time=2000000, initial_run=False)
        
        self.assertTrue(any(a['type'] == 'LOG' and a['state'] == 'ACTIVE' for a in actions))
        self.assertTrue(any(a['type'] == 'NOTIFY' for a in actions))
        
        # 2. Continues active: No new log/notify
        actions = self.processor.process([active_conn], current_time=2000100, initial_run=False)
        self.assertEqual(len([a for a in actions if a['type'] in ('LOG', 'NOTIFY')]), 0)

        # 3. Becomes IDLE
        # 432000 - 431000 = 1000s inactive (> 300s threshold)
        idle_conn = {'device': 'PC', 'proto': 'UDP', 'expiry': 431000}
        actions = self.processor.process([idle_conn], current_time=2000200, initial_run=False)
        self.assertTrue(any(a['type'] == 'LOG' and a['state'] == 'IDLE' for a in actions))

    def test_significant_resumption(self):
        # 1. Session was IDLE for a long time
        # Pre-set state to IDLE with long inactive time
        self.processor.state = {
            'PC_UDP': {
                'state': 'IDLE',
                'prev_inactive': 2000 # > 1800s threshold
            }
        }
        
        # 2. Resumes ACTIVE
        active_conn = {'device': 'PC', 'proto': 'UDP', 'expiry': 431900} # 100s inactive
        actions = self.processor.process([active_conn], current_time=3000000, initial_run=False)
        
        self.assertTrue(any(a['type'] == 'NOTIFY' and 'Resumed' in a['body'] for a in actions))

if __name__ == '__main__':
    unittest.main()
