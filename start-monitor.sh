#!/bin/bash

echo "🤖 Starting Helfi Auto-Fix Monitor..."
echo "📍 Working directory: $(pwd)"
echo "⏰ Monitor will check for tasks every 2 minutes"
echo "🛑 Press Ctrl+C to stop"
echo ""

# Change to the correct directory
cd "/Volumes/U34 Bolt/HELFI APP/helfi-app"

# Start the monitor
node todoist-monitor.js 