# コスト管理

## Budgetの責務

- `aws-account-monthly-cost`: AWSアカウント全体を対象とするBudget。`aws-account-foundation`で管理する。
- `stella-quest-duel-monthly`: `Project=stella-quest-duel`を対象とするBudget。このリポジトリで管理する。

## 移行前提

`Project`はユーザー定義コスト配分タグとしてBilling and Cost Managementで有効化する。Cost Explorerに`Project=stella-quest-duel`が表示され、タグで絞ったコストを確認できるまでBudgetの移行は実行しない。

タグ有効化からCost Explorerへの反映には最大24〜48時間かかることがある。

## 移行手順

1. アカウント全体Budgetが作成済みで、通知先メールが登録済みであることを確認する。
  → 作成済み
2. 既存のフィルターなし`stella-quest-duel-monthly`を削除する。
  → 削除済み
3. `infrastructure/cost-budget.yaml`をCloudFormationでデプロイする。
4. Budgets APIで、作成したBudgetのフィルターが`Project=stella-quest-duel`であることを確認する。

既存Budgetを削除してから新規Budgetを作成する短時間は、アカウント全体Budgetが安全網となる。

## デプロイ

スクリプトは通知先メールアドレスを対話入力する。実値をGit、シェル履歴、`.env`へ保存しない。AWS CLIのprofileは`AWS_PROFILE`、リージョンは`AWS_REGION`を使用する。未設定の場合、AWS CLIのdefault profileと`ap-northeast-1`を使用する。

```bash
scripts/create-project-budget-change-set.sh
```

change set確認後、次のコマンドで実行する。

```bash
aws cloudformation execute-change-set \
  --stack-name stella-quest-duel-cost-management \
  --change-set-name initial-deploy \
  --region "${AWS_REGION:-ap-northeast-1}"

aws cloudformation wait stack-create-complete \
  --stack-name stella-quest-duel-cost-management \
  --region "${AWS_REGION:-ap-northeast-1}"
```
