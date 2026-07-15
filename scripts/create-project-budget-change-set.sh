#!/usr/bin/env bash
set -euo pipefail

readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly repository_dir="$(cd "${script_dir}/.." && pwd)"
readonly stack_name="stella-quest-duel-cost-management"
readonly change_set_name="initial-deploy"
readonly region="${AWS_REGION:-ap-northeast-1}"

read -r -p "Budget alert email: " budget_alert_email

aws cloudformation validate-template \
  --template-body "file://${repository_dir}/infrastructure/cost-budget.yaml" \
  --region "${region}" \
  --no-cli-pager

aws cloudformation create-change-set \
  --stack-name "${stack_name}" \
  --change-set-name "${change_set_name}" \
  --change-set-type CREATE \
  --template-body "file://${repository_dir}/infrastructure/cost-budget.yaml" \
  --parameters "ParameterKey=BudgetAlertEmail,ParameterValue=${budget_alert_email}" \
  --region "${region}" \
  --no-cli-pager

aws cloudformation wait change-set-create-complete \
  --stack-name "${stack_name}" \
  --change-set-name "${change_set_name}" \
  --region "${region}"

aws cloudformation describe-change-set \
  --stack-name "${stack_name}" \
  --change-set-name "${change_set_name}" \
  --region "${region}" \
  --no-cli-pager
