#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
CLEAN_DATA=0
ASSUME_YES=0

usage() {
    cat <<'EOF'
Usage: ./clean.sh [--data] [--yes]

  --data  Also remove core/data runtime data. Prompts unless --yes is used.
  --yes   Skip the runtime data confirmation prompt.
EOF
}

for arg in "$@"; do
    case "$arg" in
        --data) CLEAN_DATA=1 ;;
        --yes) ASSUME_YES=1 ;;
        -h|--help) usage; exit 0 ;;
        *)
            echo "Unknown option: $arg" >&2
            usage >&2
            exit 2
            ;;
    esac
done

cd "$SCRIPT_DIR"

if [[ -f "$SCRIPT_DIR/app_dev.pid" ]]; then
    if [[ -x "$SCRIPT_DIR/stop.sh" ]]; then
        echo "Stopping the service before cleaning..."
        "$SCRIPT_DIR/stop.sh"
    else
        echo "app_dev.pid exists but stop.sh is unavailable; refusing to clean." >&2
        exit 1
    fi
fi

delete_data='N'
if (( CLEAN_DATA )); then
    if (( ASSUME_YES )); then
        delete_data='Y'
    elif [[ -t 0 ]]; then
        read -r -p 'Delete runtime data in core/data (accounts, credentials and logs)? [y/N] ' answer
        [[ "$answer" =~ ^[Yy]$ ]] && delete_data='Y'
    else
        echo '--data requires --yes when stdin is not interactive.' >&2
        exit 2
    fi
fi

remove_path() {
    local path="$1"
    if [[ -e "$path" || -L "$path" ]]; then
        rm -rf -- "$path"
        echo "Removed: ${path#"$SCRIPT_DIR/"}"
    fi
}

echo "Cleaning generated files for packaging..."

remove_path "$SCRIPT_DIR/node_modules"
remove_path "$SCRIPT_DIR/core/node_modules"
remove_path "$SCRIPT_DIR/web/node_modules"
remove_path "$SCRIPT_DIR/core/dist"
remove_path "$SCRIPT_DIR/web/dist"
remove_path "$SCRIPT_DIR/coverage"
remove_path "$SCRIPT_DIR/.nyc_output"
remove_path "$SCRIPT_DIR/core/coverage"
remove_path "$SCRIPT_DIR/web/coverage"
remove_path "$SCRIPT_DIR/core/client.js"
remove_path "$SCRIPT_DIR/web/stats.html"
remove_path "$SCRIPT_DIR/app_dev.pid"
remove_path "$SCRIPT_DIR/app_dev.log"

while IFS= read -r -d '' cache_file; do
    remove_path "$cache_file"
done < <(find "$SCRIPT_DIR" -type f -name '*.tsbuildinfo' -print0)

if [[ "$delete_data" == 'Y' ]]; then
    remove_path "$SCRIPT_DIR/core/data"
fi

echo "Cleaning complete. Runtime data was preserved unless --data was supplied."
