#!/usr/bin/env bash
# macOS: double-click to update Personal Superpower.
cd "$(dirname "$0")" && ./update.sh
echo
read -r -p "Press Return to close this window." _
