#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

service_name="${ACTUAL_AI_SERVICE:-actual-ai}"
mode="dry-run"

if [[ "${1:-}" == "--apply" ]]; then
  mode="apply"
  shift
fi

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage:
  scripts/reset-actual-ai-transactions.sh
  scripts/reset-actual-ai-transactions.sh --apply

What it does:
  - Connects to Actual using the env already loaded in the running actual-ai container
  - Finds on-budget expense transactions that actual-ai would normally consider
  - Clears their category (sets it to null)
  - Removes #actual-ai / #actual-ai-miss tags from notes

Safety:
  - Default mode is dry-run (no changes)
  - Use --apply to write changes

Requirements:
  - The docker compose stack must be running
  - The actual-ai service must be running
EOF
  exit 0
fi

if ! docker compose ps --status running "$service_name" >/dev/null 2>&1; then
  echo "Service '$service_name' is not running. Start it first with: docker compose up -d $service_name" >&2
  exit 1
fi

docker compose exec -T \
  -e RESET_ACTUAL_AI_MODE="$mode" \
  "$service_name" \
  node --input-type=module - <<'EOF'
import * as actual from '@actual-app/api';

const serverURL = process.env.ACTUAL_SERVER_URL;
const password = process.env.ACTUAL_PASSWORD;
const budgetId = process.env.ACTUAL_BUDGET_ID;
const e2ePassword = process.env.ACTUAL_E2E_PASSWORD || '';
const guessedTag = process.env.GUESSED_TAG || '#actual-ai';
const notGuessedTag = process.env.NOT_GUESSED_TAG || '#actual-ai-miss';
const mode = process.env.RESET_ACTUAL_AI_MODE || 'dry-run';

if (!serverURL || !password || !budgetId) {
  console.error('Missing one of ACTUAL_SERVER_URL, ACTUAL_PASSWORD, or ACTUAL_BUDGET_ID in the actual-ai container.');
  process.exit(1);
}

const shouldApply = mode === 'apply';
const dataDir = '/tmp/actual-ai-reset';
const startDate = '1990-01-01';
const endDate = '2030-01-01';

function stripActualAiTags(notes) {
  return (notes || '')
    .replace(new RegExp(`\\s*${escapeRegExp(guessedTag)}`, 'g'), '')
    .replace(new RegExp(`\\s*${escapeRegExp(notGuessedTag)}`, 'g'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isEligibleExpense(transaction, offBudgetAccountIds) {
  if (transaction.amount >= 0) {
    return false;
  }
  if (transaction.transfer_id !== null && transaction.transfer_id !== undefined) {
    return false;
  }
  if (transaction.starting_balance_flag === true) {
    return false;
  }
  if (transaction.is_parent) {
    return false;
  }
  if (offBudgetAccountIds.has(transaction.account)) {
    return false;
  }
  return true;
}

async function main() {
  console.log(`Reset mode: ${shouldApply ? 'APPLY' : 'DRY RUN'}`);

  await actual.init({
    dataDir,
    serverURL,
    password,
  });

  try {
    if (e2ePassword) {
      await actual.downloadBudget(budgetId, { password: e2ePassword });
    } else {
      await actual.downloadBudget(budgetId);
    }

    const accounts = await actual.getAccounts();
    const offBudgetAccountIds = new Set(
      accounts.filter((account) => account.offbudget).map((account) => account.id),
    );

    let transactions = [];
    for (const account of accounts) {
      const accountTransactions = await actual.getTransactions(account.id, startDate, endDate);
      transactions = transactions.concat(accountTransactions);
    }

    const targets = transactions.filter((transaction) => isEligibleExpense(transaction, offBudgetAccountIds));

    let changed = 0;
    let alreadyReset = 0;

    for (const transaction of targets) {
      const nextNotes = stripActualAiTags(transaction.notes || '');
      const categoryIsCleared = transaction.category === null || transaction.category === undefined;
      const notesAlreadyClean = nextNotes === (transaction.notes || '');

      if (categoryIsCleared && notesAlreadyClean) {
        alreadyReset += 1;
        continue;
      }

      changed += 1;

      if (shouldApply) {
        await actual.updateTransaction(transaction.id, {
          category: null,
          notes: nextNotes,
        });
      }
    }

    console.log(`Accounts: ${accounts.length}`);
    console.log(`Transactions scanned: ${transactions.length}`);
    console.log(`Eligible expense transactions: ${targets.length}`);
    console.log(`Already reset: ${alreadyReset}`);
    console.log(`${shouldApply ? 'Updated' : 'Would update'}: ${changed}`);
  } finally {
    await actual.shutdown();
  }
}

main().catch(async (error) => {
  console.error('Reset failed:', error);
  try {
    await actual.shutdown();
  } catch {
    // Best effort.
  }
  process.exit(1);
});
EOF
