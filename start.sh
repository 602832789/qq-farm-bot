#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

pnpm run install:all

nohup pnpm run dev > app_dev.log 2>&1 &
echo "$!" > app_dev.pid

echo "Started qq-farm-bot with PID $(cat app_dev.pid). Logs: app_dev.log"
