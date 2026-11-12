# Architecture and behaviour

## Shape of the app

ultralead+ is a React/TypeScript single-page application built with Vite. The UI has no application backend and does not make network requests containing customer data. Styling is local CSS and icons are bundled with the application.

```text
src/
  App.tsx                 View routing, dialogs and user-gesture actions
  components/             Calling desk, lists, pipeline, settings and dialogs
  hooks/useWorkspace.ts   Persistence, clock, expiry and same-origin tab updates
  domain/
    types.ts              Versioned data model
    import.ts             Paste parsing, exclusions and age-review rules
    dates.ts              Local dates and ID birth-date inference
    queue.ts              Readiness, indexed lookups and deterministic cycling
    analytics.ts          Windowed performance, funnel and package/ATT analysis
    money.ts              Exact-cent price parsing and referral reward tiers
    referrals.ts          Referral attribution, eligibility and manual payment history
    workspace.ts          Immutable business operations and state transitions
    storage.ts            Validation, migration and local storage repository boundary
    clipboard.ts          Clipboard API and fallback
    demo.ts               Explicitly labelled, invented sample records
```

Domain functions are independent of React. Timestamps are ISO strings; callback input and day boundaries use the browser's local time. List dates are calendar dates, not UTC timestamps. The recent activity feed is capped at 300 entries; per-customer call attempts remain in the profile until history is cleared.

## Data boundaries and invariants

- A **lead** is a snapshot of the current daily list, keyed by its `5-` account number. The list has at most one row per account. Replacing it does not replace other entities.
- A **customer profile** is keyed by account and contains notes, call attempts, the do-not-call decision, exclusion reason, and a queue-reset timestamp. Resetting eligibility leaves prior attempts intact.
- A **callback** contains its own lead snapshot, time, and note, so it survives daily list replacement. There is at most one scheduled callback per account. Re-scheduling updates it rather than duplicating it.
- A **sale** contains its own lead snapshot, package name, optional actual price in integer cents, and stage. Its ATT/non-ATT type is `null` through credit vetting and confirmation and is set by `updateSaleStage(..., 'activated', now, type)`, which refuses to complete an activation without one. A new non-declined sale cannot be recorded while another non-declined sale exists for that account. Package suggestions are strings and can be changed without altering historical sale records; a price is never inferred from the name.
- Sale transitions are explicitly constrained: `credit_vetting → pending_confirmation → activated` (the activation step requires the type); vetting may be `declined` and reopened; confirmation can go back to vetting; an activation can be moved back to confirmation. An activation timestamp exists only while the sale is activated. Completed totals are derived from sale records, not a manually maintained counter.
- A **referrer** can have many referrals. A **referral** records a customer name and optional contact before an account is known; once linked, a `5-` account can appear on at most one referral. Attribution survives lead-list replacement and is associated with the current non-declined sale (or the latest declined attempt). Manually adding a referred customer to leads uses an unknown-age snapshot, rejects existing exclusions or do-not-call decisions, and does not bypass queue protections.
- A referral is payable only while its associated sale is activated and has a valid price. Prices up to and including 20,000 cents earn 2,000 cents; larger prices earn 3,000 cents. Before activation or with an unknown price the amount due is zero. Status and totals are derived, not independently set. The tracker builds account indexes and paginates customers rather than rescanning every sale for every row.
- A **referral payment** is a manually recorded snapshot of the recipient, customer, sale, price, activation and reward; no money is sent by the app. There may be at most one non-corrected payment per referral. Confirmation rechecks the facts displayed before recording it and attempts to persist the complete workspace immediately; a failed write is clearly reported and the in-memory record can be exported. Reverting/deleting an activation or changing its package or price preserves the payment and flags it for review, never creating a second payable amount. The tracker can compare a changed price against the recorded amount only when the original sale, account and activation timestamp still match; the informational difference is not a payable balance. Additional payments and refunds must be tracked outside the app. Correcting an erroneous paid mark timestamps the correction and retains the old snapshot. Referrer/account attribution is locked while a payment remains marked paid; once corrected, the original identities remain in the snapshot. Individual deletion is locked whenever a referral has payment history; the separately confirmed referral clear action can erase all history.
- Lead, callback, pipeline, activation, referral and history clearing are separate operations. Deleting a sale does not implicitly erase a customer’s call history or return them to the queue. Clearing activations leaves referral/payment records in place; unpaid rewards cease to be due and paid records need review.

## Import and protection

`parseLeads` parses each non-empty pasted line into a name, account, optional customer ID, optional source date, and source status. Duplicate accounts are merged. If any row for the same account is Active, Archived, explicit 60+, or has a known age of at least 60, exclusion wins regardless of row order.

`applyImport` replaces or merges only the daily lead list, except on the first real import of the sample workspace, which discards all sample records. Excluded accounts are removed from both the list and callbacks; other historical data remains. A later eligible source row clears the prior source-exclusion flag, but does not clear a not-interested decision. Invalid or missing IDs remain in the list in an age-review state and do not enter the automatic queue. Manual verification applies to that lead snapshot; a newly imported unknown-age row needs review again.

Age calculations use the `YYMMDD` portion of a 13-digit ID, the local date and an inferred century. The century is inherently ambiguous for centenarians, and no checksum is validated; see the README before relying on this filter. When the clock advances or a workspace loads, `pruneExcluded` removes newly ineligible lead and callback snapshots, such as a customer who has reached their 60th birthday. Sales and customer history are kept.

## Queue ordering

`getSmartQueue` builds account indexes for callbacks and sales. It rejects source exclusions, age-review records, do-not-call profiles, and accounts with recorded sales. It then:

1. Places eligible due callbacks first, ordered by due timestamp.
2. Removes future callbacks and no-answer leads still inside their two-hour cooldown.
3. Holds leads after three no-answer attempts on the same local day, including callbacks.
4. Sorts remaining leads by attempts today, then a stable FNV-1a hash of workspace seed, local day and account number. Thus fresh leads precede retries and source order is not followed.

A callback's no-answer outcome updates its due time to two hours later. The queue's clock refreshes every 30 seconds and at each advance. Timing overrides are explicit and cannot bypass safety exclusions. This algorithm is local: no shared lock, central call log, or knowledge of other agents exists.

## Analysis

`analyse(workspace, range, now)` is a pure function over the same records the rest of the app writes: call attempts in customer profiles, sale timestamps and activation types. It never stores derived values, so totals cannot drift from the underlying records. Windows are rolling and local-day based (`today`, last 7 days, last 30 days, all time). Each window also computes the immediately preceding window of equal length for the trend notes.

The funnel counts sales **recorded in the window** by their current stage, and the activation rate is calculated over decided sales (activated or declined) so open vetting does not depress it. The ATT/non-ATT split and package ranking count activations **in the window** by `activatedAt`. Attempts, sales and activations in the future are ignored; a customer's history is counted from their profile, so notes and outcomes deleted through the customer-history clear action also disappear from insights.

## Persistence and extension

The `WorkspaceRepository` contract in `domain/storage.ts` is the persistence boundary. The default implementation saves a version-2 workspace as JSON in browser localStorage under a new key, falling back to the version-1 key for the first load. The old value is removed only after the upgraded value is saved successfully; an older app/tab using the old key cannot overwrite the new referral data. Valid version-1 workspaces and backups are migrated on load with no referrals and an unknown (`null`) price on every old sale; no price or reward is guessed. Older and newer app versions do not synchronize with each other; close old tabs before upgrading. Version-2 validation includes referrer links, unique linked accounts, prices and payment snapshots, including at most one active payment per referral. Loading and backup restoration validate the full shape before use; an unreadable saved value is copied to a recovery key before a clean workspace is written, where browser storage permits it. Quota or permission failures are shown in the UI. Same-origin tabs listen for storage changes; simultaneous edits remain last-write-wins, so payment records are not a shared or transactional financial system.

A future IndexedDB adapter can increase local capacity. A team version would need a real shared service with authentication, authorisation, encryption, audit/retention policies, atomic reservations and conflict handling; replacing the repository alone would not make the current queue safe for multi-agent coordination. Preserve schema versioning, migrate old workspaces, and keep the import, exclusion, deletion and transition invariants covered by tests when extending it.
