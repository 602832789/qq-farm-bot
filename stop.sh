#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
PID_FILE="$SCRIPT_DIR/app_dev.pid"

cd "$SCRIPT_DIR"
chmod +x "$SCRIPT_DIR/start.sh" "$SCRIPT_DIR/stop.sh" 2>/dev/null || true

if [[ ! -f "$PID_FILE" ]]; then
    echo "qq-farm-bot is not running: $PID_FILE does not exist."
    exit 0
fi

app_pid="$(tr -d '[:space:]' < "$PID_FILE")"
if [[ ! "$app_pid" =~ ^[0-9]+$ ]]; then
    echo "Invalid PID file; removing $PID_FILE."
    rm -f "$PID_FILE"
    exit 1
fi

if ! kill -0 "$app_pid" 2>/dev/null; then
    echo "qq-farm-bot is not running; removing stale PID file."
    rm -f "$PID_FILE"
    exit 0
fi

# Refuse to stop an unrelated process if the PID has been reused.
if [[ -d "/proc/$app_pid" ]]; then
    process_dir="$(readlink -f "/proc/$app_pid/cwd" 2>/dev/null || true)"
    if [[ -n "$process_dir" && "$process_dir" != "$SCRIPT_DIR" ]]; then
        echo "Refusing to stop PID $app_pid: its working directory is $process_dir."
        exit 1
    fi
fi

process_group="$(ps -o pgid= -p "$app_pid" 2>/dev/null | tr -d '[:space:]' || true)"
declare -a process_tree=()

collect_process_tree() {
    local parent_pid="$1"
    local child_pid

    while read -r child_pid; do
        [[ -n "$child_pid" ]] || continue
        collect_process_tree "$child_pid"
    done < <(pgrep -P "$parent_pid" 2>/dev/null || true)

    process_tree+=("$parent_pid")
}

if [[ "$process_group" == "$app_pid" ]]; then
    kill -TERM -- "-$app_pid" 2>/dev/null || true
else
    collect_process_tree "$app_pid"
    kill -TERM "${process_tree[@]}" 2>/dev/null || true
fi

for _ in {1..20}; do
    if ! kill -0 "$app_pid" 2>/dev/null; then
        rm -f "$PID_FILE"
        echo "Stopped qq-farm-bot."
        exit 0
    fi
    sleep 0.5
done

echo "Graceful shutdown timed out; forcing qq-farm-bot to stop."
if [[ "$process_group" == "$app_pid" ]]; then
    kill -KILL -- "-$app_pid" 2>/dev/null || true
else
    kill -KILL "${process_tree[@]}" 2>/dev/null || true
fi

rm -f "$PID_FILE"
echo "Stopped qq-farm-bot."
