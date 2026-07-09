#!/usr/bin/env bash
# scripts/create-issues.sh
# Batch creates GitHub issues from scripts/issues.json using the GitHub CLI (gh)
# Usage: ./scripts/create-issues.sh [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISSUES_FILE="$SCRIPT_DIR/issues.json"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN MODE — no issues will be created"
  echo ""
fi

if ! command -v jq &> /dev/null; then
  echo "❌ jq is required. Install it with: sudo apt-get install jq"
  exit 1
fi

if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) is required. Install it with: https://cli.github.com/"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo "❌ Not authenticated with GitHub. Run: gh auth login"
  exit 1
fi

TOTAL=$(jq '. | length' "$ISSUES_FILE")
echo "📋 Found $TOTAL issues in issues.json"
echo ""

COUNT=0
for i in $(seq 0 $((TOTAL - 1))); do
  TITLE=$(jq -r ".[$i].title" "$ISSUES_FILE")
  BODY=$(jq -r ".[$i].body" "$ISSUES_FILE")
  LABELS=$(jq -r ".[$i].labels | join(\",\")" "$ISSUES_FILE")

  COUNT=$((COUNT + 1))

  if $DRY_RUN; then
    echo "[$COUNT/$TOTAL] Would create: $TITLE"
    echo "  Labels: $LABELS"
    echo ""
  else
    echo "[$COUNT/$TOTAL] Creating: $TITLE"
    gh issue create \
      --title "$TITLE" \
      --body "$BODY" \
      --label "$LABELS" \
      --repo VeridionLabs/veridion
    echo ""
  fi
done

echo "✅ $COUNT issues processed"${DRY_RUN:+" (dry run)"}
