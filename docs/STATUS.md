# Mcube update status
Updated 14 October 2026, Asia/Calcutta. Version 1.1.0 Android and Windows installer checks passed for application commit `60c70cbb3155c5cd5752872f0bc2a03ff269e63f`. Production publication is recorded in the GitHub release.

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
| Owner payment alerts | Live migration, sender, encrypted credentials and retry scheduler configured; real Google HTTP v1 validation succeeds without sending; queue and permissions tests pass | Actual closed-app phone delivery needs device permission and acceptance |
| Merchants → Import existing records | CSV, Excel and readable PDF extraction, review, automatic merchant creation and dated history; atomic/idempotent database and balance tests pass | Scanned PDFs need readable export/manual correction; overlapping existing merchants are skipped for review; 10,000 transaction rows per import |
| Windows installer | [Run 38465674260](https://github.com/galaxymark59-art/Gulf-Origin-Finance/actions/runs/38465674260) built the final NSIS installer and verified the packaged app reaches sign-in | User's PC installation and tray delivery need acceptance |
| Android installer | [Run 38465674027](https://github.com/galaxymark59-art/Gulf-Origin-Finance/actions/runs/38465674027) built the final signed APK and verified its actual first launch on Android 15, plus native instrumentation | User's phone acceptance remains |

42 automated tests and TypeScript/Vite production build pass. Existing queue durability, lost-response idempotency, startup deadlines, English/Arabic receipts and 5,000-merchant filtering remain tested. File uploads were checked through the browser with fictional PDF, CSV and Excel data, including separate merchant/payment sheets.

Live Supabase migration checks: all pre-update transactions and receipts preserved; 1 account, 11 transactions, 9 receipts. New notification tables have RLS and Realtime publication enabled. Security advisor reported no errors; intentional authenticated SECURITY DEFINER RPC warnings were reviewed against explicit permission and user checks. Leaked-password checking is not enabled on the current free Auth plan.

The existing local pending SAR 1,500 correction is preserved for normal conflict review; no balance or queue has been silently cleared. No real payment, reminder or staff account was created as test data.

Phone acceptance remains: PIN/fingerprint, force-stop/offline recovery, WhatsApp PDF attachment, native Downloads, background grace and notifications on the user's device. Windows tray notifications and installation on the user's PC also need acceptance. Android force-stop, OS notification blocking, no internet, Windows Quit or PC sleep can delay alerts.
