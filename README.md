# Gulf Origin Finance
Private owner collection management for Gulf Origin International, Saudi Arabia. React 19 + TypeScript + Capacitor 8, Supabase PostgreSQL/Auth/Storage, Vercel.

## Start
1. Install Node 22.12+.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and set the project's URL and **publishable** key.
4. Run `npm run dev`; production: `npm run build`.
5. Run `npm test` for money, reporting, pending-operation recovery and retry tests.

The requested Supabase project is `zyrsakqocyjvfgauwdiz`. Vercel project: Gulf Origin / gulf-origin-finance. GitHub: galaxymark59-art/Gulf-Origin-Finance.

## Owner account and persistent login
The authorized owner is Ahmedmarwan8374@gmail.com. The initial account was created through Supabase Auth. Its password is deliberately absent from source, migrations and client bundles.

`persistSession: true` and `autoRefreshToken: true` keep the account signed in across reloads and app restarts. Native tokens are stored through Android Keystore encryption. PIN / fingerprint lock preserves the underlying session. Sign-out, revoked sessions, password changes, cleared app data or an administrator's session policy can still require sign-in.

There is no merchant sign-in or public sign-up interface. Database access is independently restricted to the sole UUID in `owner_profiles`, not an editable JWT metadata field. Disable public signup in Supabase Auth settings as an additional protection.

## Database
The schema lives in `database/schema.sql` and the CLI-created versioned migration in `supabase/migrations/`. This schema was applied to the requested project and its rollback-only ledger acceptance test passed. **Do not rerun the initial schema against an already-provisioned database.** Future changes need additive migrations.

For a fresh project:
1. Apply the versioned migration with the Supabase CLI or the SQL editor.
2. Create the owner using Supabase Auth's admin UI or its supported Admin API.
3. Review and run `database/provision-owner.sql`.
4. Configure the Auth site URL and permitted recovery redirect URLs to the actual deployment origin.
5. Disable public signup; retain short-lived access tokens and normal refresh-token reuse protection.

Amounts are integer halalas. Browser inputs reject excess decimal precision. The database serializes each merchant's updates with row locks, assigns independent receipt numbers and atomically saves entries, receipts, audit records and operation receipts. Direct client INSERT/UPDATE/DELETE privileges on ledger tables are absent. Receipts, ledger rows, shares and audit rows reject updates and deletes. Corrections create reversal entries.

The public RPC wrapper invokes a private privileged function with an explicit owner check and empty search path. `get_snapshot` uses caller privileges and RLS. Every exposed table has RLS. The receipt bucket is private with owner-scoped insert/read policies and no client overwrite/delete policies.

## Main workflow
- Configure the business profile/logo once in More.
- Add a merchant with opening balance, phone, unique prefix and receipt language.
- Record payment, or adjust the outstanding balance.
- Save locally, then sync for an authoritative receipt number.
- Generate/download a real PDF or choose Save & share PDF.
- Android opens its native share sheet with the PDF attached. Select WhatsApp and confirm the recipient and send.
- Mark the receipt manually sent after completing the send. Share initiation is never labeled delivered.
- Reports use Asia/Riyadh day boundaries; adjustments do not count as collected money.
- Export real XLSX collections reports and full merchant statements.

## Offline model and recovery
The authoritative cloud snapshot and pending queue are saved together before success is displayed. Native storage uses SQLCipher-encrypted SQLite. Browser cache uses AES-GCM with a non-extractable key in IndexedDB; that protects stored bytes but does not defend against malicious same-origin JavaScript or a compromised browser profile.

Stable operation IDs survive restart. If a commit succeeds but the response is lost, the same request is retried and the server returns its original result. Pending references are explicitly provisional; final numbers are assigned only at cloud commit. Server conflicts stop the queue. More → Sync shows the operation and requires explicit acceptance before applying it to the latest cloud balance.

Export encrypted backups under More → Sync. Recovery loads confirmed records from Supabase and merges missing pending IDs; it does not replace cloud history. Keep the backup password safe. Receipt PDF bytes are held on the originating device and uploaded to private Storage when generated online; receipt snapshots remain in the ledger.

## Android
See `docs/ANDROID.md`. The native platform and branded resources are included. GitHub Actions verifies the project and builds an installable debug APK on main pushes. Production signing needs an owner's private signing key; keys and passwords must remain outside source control.

## Verification and release status
See `docs/STATUS.md` for evidence and the remaining acceptance work. This is a functional initial implementation with a tested ledger, not a claim that native-device acceptance or production security review has been completed.

## Platform references
- [Supabase sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Capacitor file sharing](https://capacitorjs.com/docs/apis/share)
- [SQLite encryption](https://github.com/capacitor-community/sqlite/blob/master/docs/DatabaseEncryption.md)
- [Vercel Git deployments](https://vercel.com/docs/git)
- [Android secure file sharing](https://developer.android.com/training/secure-file-sharing)
