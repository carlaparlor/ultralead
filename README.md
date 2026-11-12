# ultralead+

A minimal, local-first calling desk for moving through leads, remembering conversations, tracking sales through to activation, and recording referral rewards. No account, database, API key, or separate backend is required.

## Install on Windows (no Node.js required)

1. Download the latest **ultralead+ Windows installer** (`.exe`) from the project's GitHub **Releases** page.
2. Run the installer and follow the prompts. Launch **ultralead+** from the Start menu when it finishes.

The installer includes the application; Node.js is not needed to install or run it. Windows 10/11 is supported. On a machine without the Microsoft Edge WebView2 Runtime, the installer offers to download/install that Microsoft runtime, so an internet connection may be needed for first launch. The `.msi` installer is also available for managed deployments.

Your workspace is stored locally on this Windows user profile and is not shared with the browser version or another computer. Keep regular backups via **Data & settings → Export backup**.

### Run from source (developers)

Install [Node.js](https://nodejs.org/) **22.12 or newer**, then run:

```sh
npm ci
npm run dev
```

Open the local address printed in the terminal (normally `http://localhost:5173`). To run the desktop shell during development, install Rust and the Windows build prerequisites, then use `npm run desktop:dev`. Build an installer with `npm run desktop:build`.

The first visit contains clearly labelled **sample data**, including sample referrals. When you add your first referral from the sample workspace, the app offers to clear the sample and start fresh so your real referral is not lost on a later import. You can also choose **Clear sample data**, or simply import your own leads: the first real import replaces the entire sample workspace, including any changes made to it, even if you select “add to current list”. Your real data is never mixed with the sample records.

For a production build, run `npm run build`, then `npm run preview` to try it locally. The `dist` folder can also be hosted as a static site at the root of an HTTPS origin; no application server is needed. Use the same address and browser each day so you see the same locally saved workspace.

## Your daily workflow

1. Log in to your existing calling system as usual. Copy your rows, then **paste anywhere on the calling desk**. The list imports the moment you paste; nothing else to click. Use the **REPLACE / ADD** switch next to the paste field to say whether the paste starts today's list or merges into it — the choice is remembered, so it is a one-step import from then on. A short **UNDO** button appears in the notification if you paste the wrong thing.
2. Prefer to check the counts before importing? Choose **Review first** on the desk, or **Import leads** in the top bar. Replacing the list does **not** erase callbacks, sales, activations, notes, or call history.
3. On the calling desk, everything you need for the call is on one screen: the next lead, the account number, the notes, and the outcome buttons. Copy the displayed **5- account number** and paste it into your existing system. With **Auto-copy next account** on, the next number is copied when you import, skip, select a lead, or log an outcome, subject to browser permission. The first lead on a later page load can be copied with the **Copy** button or `V`.
4. After the call, choose **No answer**, **Not interested**, **Callback**, or **Made a sale**. Customer notes are saved as you type and follow the account across imports. The notebook button (notes & history) opens a customer's full record — notes, every logged call and their place in the pipeline — from **All leads**, **Callbacks**, **Sales pipeline** and **Activations**, so notes stay reachable at any stage, including after a sale leaves the calling queue.
5. A sale starts in **Credit vetting**. Mark it approved to move it to **Awaiting confirmation**. Only choose **Complete activation** after the confirmations department has finished. **ATT or non-ATT is chosen at that moment** — the pipeline shows "at activation" until then, because the split is a result, not a guess. The Activations page tracks the package and type, with **all-time, today, and this month** filters. Notes remain editable from any of those stages through the customer record. Declined vetting can be reopened; completed activations can be moved back if necessary, and the recorded type can be corrected from the activations list.
6. Deals change: type any package name and, if known, its actual price in rand while recording a sale, or manage package suggestions in **Data & settings**. The activation type is not known until activation. Removing a suggestion does not alter existing sales.
7. Use **Referrals** to record who introduced a customer, follow their progress, and track what you owe after activation. Payments are made outside the app and marked paid manually.

The app does not log in to your employer's system, place calls, perform credit checks, or contact the confirmations department. Those steps stay in your existing system; ultralead+ records your progress.

### Pasting leads

Paste one customer per line, with tabs or spaces. For example (invented data):

```text
Nomsa Example    Prospect    Consumer    5-12345678901234    9005120000000    2026-10-28
Alex Example     Active      Consumer    5-12345678901235    8507210000000    2026-10-28
```

A row needs a name before a `5-` followed by digits. A 13-digit customer ID and `YYYY-MM-DD` list date can follow the account number. Blank lines are ignored. The preview reports invalid rows, duplicates within the paste, filtered accounts, and leads needing age review. Repeated accounts are merged; if contradictory rows contain an excluded status, the excluded row wins.

- **Active**, **Archived**, and an explicit **60+** status are excluded, case-insensitively. Known customers aged **60 or older** are also excluded. A matching existing lead and callback are removed from calling; existing sales, activations, notes, and history are retained.
- Age is inferred from the first six digits (`YYMMDD`) of a 13-digit South African-style ID. Missing, malformed, impossible, or future birth dates are held for **age review** and cannot enter the automatic queue until you explicitly verify that the customer is under 60. A newly imported row must be verified again if its age is still unknown.
- **Important limitation:** the ID's two-digit year does not encode a century. The app assumes the most recent century consistent with the current year; it cannot reliably distinguish a person over 100 from a much younger person with the same `YYMMDD`. It does not validate an ID checksum. Verify age in your source system whenever there is doubt; the filter is not proof of age.

### Referrals and payments

1. Open **Referrals → Add referral**. Choose an existing referrer or add a person with an optional contact. Enter the customer's name and, optionally, their contact and `5-` account. An introduction can be captured before an account is known; edit it later to link the account. One customer account can be attributed to only one referral.
2. Link to a customer already in the workspace, or enter an account that will be imported later. If the account is not in the lead list, **Add to leads** creates a lead with an unknown age. Check the customer's status in your calling system and verify their age before calling. Existing exclusions, do-not-call decisions, callbacks and queue protections still apply. Referrals survive daily list replacement; a referral on its own does not make an unlinked person callable.
3. Record the actual **deal price in rand** when entering/editing a sale, or at activation. Package names and suggestions do not contain reliable prices, so they are never used to guess one. An existing activation without a price shows **Needs price** and cannot be marked paid until the price is entered. Older workspaces are migrated with prices unknown.
4. A reward becomes **Ready to pay** only after the linked sale passes vetting and confirmation and is activated: **R20 for a package costing R200.00 or less**, and **R30 for a package costing more than R200.00**. Exact cents are used, so R200.01 earns R30. Declined, unactivated or unpriced sales are not payable. The tracker shows the amount due and a per-referrer total.
5. Send the money yourself, then choose **Mark paid** and confirm. The app does **not** send payments, contact people, or store banking details. If browser storage fails, the app warns that the mark is only in memory; export a backup before leaving. Payment history records the recipient, customer, sale, price, activation and amount. If an activation is reversed, removed or its package/price is changed after payment, the record remains paid and is flagged for review; it is never automatically paid twice. For a price change on the same activation, the tracker compares the recalculated reward with the recorded payment and shows any possible difference. This difference is not included in ready-to-pay totals. Additional payments and refunds cannot be recorded in the app and must be tracked separately. Use **Payment history → Correct paid mark** only if the mark was entered in error: this does not reverse a real transfer and may make the referral due again.

Referrals, contacts and payment history are stored in the same private browser workspace and backups as the rest of the data. Tabs are last-write-wins, so check the current records before paying and do not treat this as a shared payment ledger. An individual referral with payment history is retained to avoid losing that record; the explicitly confirmed **Clear referrals & payment history** action removes all of it. On upgrade, the old workspace is migrated and removed only after the new copy saves successfully. Close old app tabs first: older app versions do not synchronize with the upgraded workspace.

### Insights

**Insights** adds up what you have already logged and shows it in one place: calls logged, contact rate, sales, activations and the average days from sale to activation, each compared with the previous period of the same length. Below that, a chart stacks each call's outcome (sale, callback, not interested, no answer) per day, the sales funnel shows how many recorded sales reached confirmation and activation, and the ATT/non-ATT split is broken down alongside your best-selling packages.

Switch between **today**, **7 days**, **30 days** and **all time**. Everything is derived from your local workspace — the same attempt, sale and activation records shown elsewhere in the app — so it updates as you log outcomes, and nothing is sent anywhere. The numbers describe only your own calls: they cannot see colleagues' activity.

### How smart cycling works

- Due callbacks come first, oldest due time first. Future callbacks wait until their scheduled time.
- Other eligible leads are shuffled using a workspace-specific seed and the local calendar day, rather than the order they were pasted. Fresh leads come before today's retries.
- A **No answer** result waits two hours before another automatic attempt. After three no-answer attempts in a local day, that customer waits until the next day. A no-answer callback is moved two hours forward and also respects the daily limit.
- **Not interested** stays out of the queue across future imports. You can deliberately return the customer to the queue from All leads without deleting their notes or historical attempts. A sale also removes the customer from automatic cycling.
- You can deliberately call a scheduled or cooling-down lead early from its list after confirming the override. Excluded customers, unverified ages, not-interested customers, and customers with recorded sales cannot be bypassed this way.

**This is a personal workspace.** It does not see calls made by colleagues and cannot reserve leads or prevent duplicate calls across agents. Different workspace seeds help avoid everyone following the same straight-line sequence, but they are not a substitute for shared, real-time coordination.

### Shortcuts

On the calling desk, when not typing in a field or using a dialog:

| Key | Action |
| --- | --- |
| `N` | No answer |
| `X` | Not interested |
| `C` | Schedule callback |
| `S` | Record sale |
| `V` | Copy account number |
| `→` / `←` | Cycle to the next / previous queued lead |

Arrow keys only move through the queue; they never log an outcome or change a customer's record. `SKIP LEAD` on the desk does the same as `→`.

Clipboard access normally requires HTTPS or localhost, a user action, and browser permission. If automatic copying is blocked, use the **Copy** button or manually select the number. The app reports a failure instead of claiming a copy succeeded.

## Delete only what you intend

Individual leads, callbacks, sales, and activations have their own delete controls. **Data & settings → Data controls** also offers separate confirmed actions:

| Clear | Removed | Kept |
| --- | --- | --- |
| Lead list | Current daily list | Callbacks, pipeline, activations, notes and history |
| Callbacks | Scheduled callbacks | Leads, sales, activations, notes and history |
| Sales pipeline | Vetting, pending and declined sales | Completed activations and other records |
| Activations | Completed activations | Pipeline, referrals and payment history; paid referrals are flagged for review |
| Referrals & payment history | All referrals, referrers and their payment history | Leads, callbacks, sales, activations and notes |
| Customer notes & call history | Notes, attempts, exclusion and not-interested flags, recent activity | Leads, callbacks, sales and referrals |

A retained callback can still become callable even if its lead has been removed from the daily list. Deleting a callback can return its lead to the queue. Deleting a sale leaves its historical attempt in place so the customer is not immediately called again; if appropriate, use **Return to queue** on the lead. Clearing customer history removes do-not-call flags and can make previously suppressed leads eligible again, so use it carefully.

## Backups and privacy

- Data is stored in **this browser's localStorage**, scoped to the exact site origin (including port). It is not sent to a backend or shared with coworkers or other devices. The app does not use third-party analytics.
- Browser storage and exported JSON backups are **not encrypted**. Backups include customer names, account numbers, IDs, notes, sales, referrer contacts and payment history. Do not enter bank details. Use a trusted device, secure backups, and follow your employer's customer-data and privacy policies.
- Clearing browser/site data, using private browsing, changing browsers or addresses, or hitting storage limits can lose access to saved work. A storage failure is shown in the app. Export a backup regularly using **Data & settings → Export backup**; use **Restore backup** to validate and replace the current workspace with one you previously exported.
- Tabs on the same browser and origin listen for each other's changes, but concurrent edits are last-write-wins. This is not a multi-user database. Keep a backup before making large changes.
- Browser storage has finite, browser-dependent capacity. The lead table is paginated and queue lookups are indexed, but very large histories or a shared team deployment should use a more capable storage service.

## Typography

The interface is set in **Courier For The People** (SIL Open Font License) where it is installed, falling back to **Courier Prime** and then the system Courier.

Courier Prime is committed to this repository in `src/fonts/` (two woff2 files, about 38 KB total) and loaded with `@font-face` in `src/styles.css`, so the app needs no extra packages and never renders in Courier New. Its OFL licence is next to the files in `src/fonts/OFL-CourierPrime.txt`.

To ship Courier For The People as well, put its web font files in `src/fonts/` and uncomment the matching `@font-face` block at the top of `src/styles.css`. Keep that font's OFL licence alongside the files.

## Development and tests

```sh
npm test          # unit + React workflow tests
npm run build     # TypeScript check + production build
npm run preview   # serve the built site locally
```

See [architecture](docs/architecture.md) for the data model, queue rules and extension points, and [testing](docs/testing.md) for the automated coverage and a manual checklist.
