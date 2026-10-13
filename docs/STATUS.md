# Mcube update status
Updated 13 October 2026, Asia/Calcutta. Version 1.1.0 source; installer release checks are still in progress.

| Change and location | Verification | Remaining limit |
|---|---|---|
| Mcube branding in app, Android resources and new documents | Matching assets generated; genuine PDFs rendered and inspected | Historical issued receipts preserve their original snapshots |
| More → Users, owner/collector/viewer permissions and activity | Live manage-users function deployed; database role, disabled-account and final-owner tests pass | No staff accounts created during testing |
| Persistent login, PIN and 30-second background grace | Session startup and lock-policy tests pass | Device fingerprint and password recovery need phone acceptance |
| Invoices and Returns, linked goods and original PDFs | Exact item arithmetic, duplicate and return tests pass; fictional invoice PDF imported through browser | Text extraction needs review; scanned PDFs require manual entry |
| Merchant history, current payment plus previous 15 days in shared receipt | Immutable server snapshot test and genuine PDF export pass; later/older records excluded | Historical receipts without a frozen history use records known at issuance |
| Overdue merchants and WhatsApp reminder | Recorded due-date tests pass; reminder opens a prefilled free WhatsApp message | User reviews and sends; no automatic delivery confirmation |
| Cash, purchases, expenses, transfers and physical cash count | Server-calculated count, neutral company handovers and original-holder reversal tests pass | Opening cash must be configured before relying on totals |
| Shared Savings section, running balance and destination choice | Cash/savings reconciliation and direct savings purchase tests pass | Later entries can change a previously counted day's current cash figure |
| Reports, presets, filters, A–G cash PDF and Excel | Real XLSX reopened; totals agree with ledger; PDF pages visually inspected | Large histories still synchronize as a full snapshot |
| Responsive exports | New report generation runs in a worker; browser PDF download succeeds | No claim of millisecond performance on every device or network |
| Owner payment alerts | Live protected migration and sender function deployed; generic payload, messaging scope, service-only queue and delivery deduplication tests pass | Firebase credentials, Android SDK configuration and real phone closed-app delivery still need verification |
| Android and Windows installers | Workflows prepared, including actual packaged-app first launch | Version 1.1.0 build/release results not yet recorded here |

35 automated tests and TypeScript/Vite production build pass. Existing queue durability, lost-response idempotency, startup deadlines, English/Arabic receipts and 5,000-merchant filtering remain tested.

Live Supabase migration checks: all pre-update transactions and receipts preserved; 1 account, 11 transactions, 9 receipts. New notification tables have RLS and Realtime publication enabled. Security advisor reported no errors; intentional authenticated SECURITY DEFINER RPC warnings were reviewed against explicit permission and user checks. Leaked-password checking is not enabled on the current free Auth plan.

The existing local pending SAR 1,500 correction is preserved for normal conflict review; no balance or queue has been silently cleared. No real payment, reminder or staff account was created as test data.

Phone acceptance remains: PIN/fingerprint, force-stop/offline recovery, WhatsApp PDF attachment, native Downloads, background grace and notifications on the user's device. Windows tray notifications and installation on the user's PC also need acceptance. Android force-stop, OS notification blocking, no internet, Windows Quit or PC sleep can delay alerts.
