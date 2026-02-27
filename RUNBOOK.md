# TG-LLM Runbook

## Access
- Server: `root@5.129.227.217`
- Project root: `/root/tg-llm-mvp`
- Backend: `/root/tg-llm-mvp/backend`
- Service: `tg-llm`

## Deploy
```bash
ssh root@5.129.227.217
cd /root/tg-llm-mvp
git fetch origin
git pull --ff-only origin main
systemctl restart tg-llm
systemctl status tg-llm --no-pager -n 30
```

## Manual Maintenance
Use `BILLING_ADMIN_TOKEN` in header `X-Billing-Admin-Token`.

Dry-run:
```bash
curl -sS -X POST \
  -H "X-Billing-Admin-Token: $BILLING_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true}' \
  http://127.0.0.1:3001/api/billing/admin/subscription/maintenance/run
```

Real run:
```bash
curl -sS -X POST \
  -H "X-Billing-Admin-Token: $BILLING_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false}' \
  http://127.0.0.1:3001/api/billing/admin/subscription/maintenance/run
```

## Funnel Analytics
Last 24 hours:
```bash
curl -sS \
  -H "X-Billing-Admin-Token: $BILLING_ADMIN_TOKEN" \
  "http://127.0.0.1:3001/api/billing/admin/analytics/funnel?hours=24"
```

Tracked events:
- `paywall_open`
- `checkout`
- `pre_checkout`
- `successful_payment`

## Pending Payments Monitoring
List stale pending payments:
```bash
curl -sS \
  -H "X-Billing-Admin-Token: $BILLING_ADMIN_TOKEN" \
  "http://127.0.0.1:3001/api/billing/admin/payments/pending?minAgeMinutes=15&limit=100"
```

Resolve one payment manually (`failed` or `succeeded`):
```bash
curl -sS -X POST \
  -H "X-Billing-Admin-Token: $BILLING_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"failed","reason":"manual_review"}' \
  "http://127.0.0.1:3001/api/billing/admin/payments/123/resolve"
```

Run timeout batch manually:
```bash
curl -sS -X POST \
  -H "X-Billing-Admin-Token: $BILLING_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"minAgeMinutes":120,"limit":200,"reason":"manual_timeout_run"}' \
  "http://127.0.0.1:3001/api/billing/admin/payments/pending/timeout/run"
```

Key env variables:
- `PENDING_PAYMENT_ALERT_ENABLED`
- `PENDING_PAYMENT_ALERT_INTERVAL_SEC`
- `PENDING_PAYMENT_ALERT_MIN_AGE_MIN`
- `PENDING_PAYMENT_ALERT_MIN_COUNT`
- `PENDING_PAYMENT_ALERT_COOLDOWN_SEC`
- `PENDING_PAYMENT_TIMEOUT_ENABLED`
- `PENDING_PAYMENT_TIMEOUT_INTERVAL_SEC`
- `PENDING_PAYMENT_TIMEOUT_MAX_AGE_MIN`
- `PENDING_PAYMENT_TIMEOUT_BATCH_LIMIT`

Webhook alert cooldown:
- `WEBHOOK_ALERT_COOLDOWN_SEC`

Telegram alert delivery requires:
- `BOT_TOKEN`
- `TELEGRAM_ALERT_CHAT_ID`

## Security Baseline (Prod)
- `INTERNAL_BYPASS_ENABLED=false`
- `INTERNAL_BYPASS_SECRET=` (empty unless explicitly needed in non-prod)
- `TELEGRAM_INITDATA_MAX_AGE_SEC=600-900`
- `BILLING_WEBHOOK_SECRET` must be set
- `BILLING_ADMIN_TOKEN` must be rotated periodically
- `BILLING_ADMIN_IP_ALLOWLIST` should include only trusted admin source IPs

## Rollback
Rollback code to previous commit:
```bash
ssh root@5.129.227.217
cd /root/tg-llm-mvp
git log --oneline -5
git checkout <COMMIT_SHA>
systemctl restart tg-llm
systemctl status tg-llm --no-pager -n 30
```

Return back to `main` after incident:
```bash
cd /root/tg-llm-mvp
git checkout main
git pull --ff-only origin main
systemctl restart tg-llm
```
