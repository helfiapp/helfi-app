#!/bin/bash
# Check Vercel deployment status - waits until deployment completes
# Usage: ./scripts/check-deployment-status.sh

VERCEL_TOKEN="${VERCEL_TOKEN:-2MLfXoXXv8hIaHIE7lQcdQ39}"
# Use the canonical Helfi production project + team IDs from DEPLOYMENT_PROTOCOL.md
PROJECT_ID="prj_0QdxIeqz4oIUEx7aAdLrsjGsqst7"
TEAM_ID="team_pPRY3znvYPSvqemdfOEf3vAT"
MAX_WAIT=300  # Maximum wait time in seconds (5 minutes)
POLL_INTERVAL=5  # Check every 5 seconds

echo "🔍 Checking latest deployment status for Helfi production project..."
echo "⏳ Waiting for deployment to complete (this may take 1-2 minutes)..."

START_TIME=$(date +%s)
LAST_STATE=""

while true; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))
  
  if [ $ELAPSED -gt $MAX_WAIT ]; then
    echo "❌ Timeout: Deployment took longer than $MAX_WAIT seconds"
    echo "   Check manually: https://vercel.com/louie-veleskis-projects/helfi-app/deployments"
    exit 1
  fi

  RESPONSE=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v6/deployments?projectId=$PROJECT_ID&teamId=$TEAM_ID&limit=1")

  if echo "$RESPONSE" | grep -q '"error"'; then
    echo "❌ Error checking deployment status:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    exit 1
  fi

  STATE=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('deployments', [{}])[0].get('state', 'UNKNOWN'))" 2>/dev/null)
  URL=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('deployments', [{}])[0].get('url', 'N/A'))" 2>/dev/null)
  READY_STATE=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('deployments', [{}])[0].get('readyState', 'UNKNOWN'))" 2>/dev/null)

  # Only print state changes to avoid spam
  if [ "$STATE" != "$LAST_STATE" ]; then
    if [ "$STATE" = "BUILDING" ] || [ "$STATE" = "QUEUED" ] || [ "$STATE" = "INITIALIZING" ]; then
      echo "   State: $STATE (elapsed: ${ELAPSED}s)"
    fi
    LAST_STATE="$STATE"
  fi

  case "$STATE" in
    "READY")
      if [ "$READY_STATE" = "READY" ]; then
        echo ""
        echo "✅ Deployment successful - changes are live!"
        echo "🌐 URL: https://$URL"
        exit 0
      fi
      ;;
    "ERROR"|"CANCELED")
      echo ""
      echo "❌ Deployment failed - state: $STATE"
      echo "   Check build logs at: https://vercel.com/louie-veleskis-projects/helfi-app/deployments"
      echo "   Fix errors and redeploy before reporting success"
      exit 1
      ;;
    "BUILDING"|"QUEUED"|"INITIALIZING")
      # Continue waiting
      sleep $POLL_INTERVAL
      ;;
    *)
      echo ""
      echo "⚠️  Unknown deployment state: $STATE"
      echo "   Check manually: https://vercel.com/louie-veleskis-projects/helfi-app/deployments"
      exit 3
      ;;
  esac
done
