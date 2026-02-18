#!/bin/bash

# ClawNet Test Runner

echo ""
echo "================================"
echo "  ClawNet Integration Test"
echo "================================"
echo ""

# Check if ClawNet is running
echo "Checking if ClawNet is running..."
if ! curl -s http://localhost:4000/health > /dev/null 2>&1; then
    echo "[!] ClawNet is not running. Starting..."
    echo ""
    ./start.sh start
    sleep 5
fi

echo ""
echo "Running tests..."
echo ""

node test-integration.js