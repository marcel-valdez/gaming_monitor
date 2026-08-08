#!/usr/bin/env bash

# Exit on any error
set -e

echo "=== Running Python Unit and Integration Tests ==="
python3 -m unittest discover -v -s tests -p 'test_*.py'

echo ""
echo "=== Running End-to-End Rendering Test ==="
./tests/run_e2e.sh

echo ""
echo "✅ All tests passed successfully!"
