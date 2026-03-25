#!/bin/bash
echo "=============================================="
echo " 🚀 Running JKKN COE Multi-Agent Workflow"
echo "=============================================="

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v ts-node >/dev/null 2>&1; then
  echo "❌ ts-node is not installed. Installing..."
  npm install -g ts-node typescript
fi

npx ts-node automation/run-multitask.ts

echo "=============================================="
echo " 🎉 Workflow Completed"
echo "=============================================="
