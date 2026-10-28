# ultralead+

A minimal, local-first calling desk for moving through leads, remembering conversations, and tracking sales through to activation. No account, database, API key, or separate backend is required.

## Start here

1. Install [Node.js](https://nodejs.org/) **22.12 or newer**.
2. In this folder, run:

   ```sh
   npm ci
   npm run dev
   ```

3. Open the local address printed in the terminal (normally `http://localhost:5173`).

The first visit contains clearly labelled **sample data**. Choose **Clear sample data**, or simply import your own leads: the first real import replaces the entire sample workspace, even if you select “add to current list”. Your real data is never mixed with the sample records.

For a production build, run `npm run build`, then `npm run preview` to try it locally. The `dist` folder can also be hosted as a static site at the root of an HTTPS origin; no application server is needed. Use the same address and browser each day so you see the same locally saved workspace.

## Your daily workflow

1. Log in to your existing calling system as usual. Copy your rows, then **paste anywhere on the calling desk**. The list imports the moment you paste; nothing else to click. Use the **REPLACE / ADD** switch next to the paste field to say whether the paste starts today's list or merges into it — the choice is remembered, so it is a one-step import from then on. A short **UNDO** button appears in the notification if you paste the wrong thing.
2. Prefer to check the counts before importing? Choose **Review first** on the desk, or **Import leads** in the top bar. Replacing the list does **not** erase callbacks, sales, activations, notes, or call history.
3. On the calling desk, everything you need for the call is on one screen: the next lead, the account number, the notes, and the outcome buttons. Copy the displayed **5- account number** and paste it into your existing system. With **Auto-copy next account** on, the next number is copied when you import, skip, select a lead, or log an outcome, subject to browser permission. The first lead on a later page load can be copied with the **Copy** button or `V`.
4. After the call, choose **No answer**, **Not interested**, **Callback**, or **Made a sale**. Customer notes are saved as you type and follow the account across imports. The notebook button (notes & history) opens a customer's full record — notes, every logged call and their place in the pipeline — from **All leads**, **Callbacks**, **Sales pipeline** and **Activations**, so notes stay reachable at any stage, including after a sale leaves the calling queue.
5. A sale starts in **Credit vetting**. Mark it approved to move it to **Awaiting confirmation**. Only choose **Complete activation** after the confirmations department has finished. **ATT or non-ATT is chosen at that moment** — the pipeline shows "at activation" until then, because the split is a result, not a guess. The Activations page tracks the package and type, with **all-time, today, and this month** filters. Notes remain editable from any of those stages through the customer record. Declined vetting can be reopened; completed activations can be moved back if necessary, and the recorded type can be corrected from the activations list.
6. Deals change: type any package name while recording a sale, or manage package suggestions in **Data & settings**. The package is known from the start; the activation type is not. Removing a suggestion does not alter existing sales.

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
| Activations | Completed activations | Pipeline and other records |
| Customer notes & call history | Notes, attempts, exclusion and not-interested flags, recent activity | Leads, callbacks and sales |

A retained callback can still become callable even if its lead has been removed from the daily list. Deleting a callback can return its lead to the queue. Deleting a sale leaves its historical attempt in place so the customer is not immediately called again; if appropriate, use **Return to queue** on the lead. Clearing customer history removes do-not-call flags and can make previously suppressed leads eligible again, so use it carefully.

## Backups and privacy

- Data is stored in **this browser's localStorage**, scoped to the exact site origin (including port). It is not sent to a backend or shared with coworkers or other devices. The app does not use third-party analytics.
- Browser storage and exported JSON backups are **not encrypted**. Backups include customer names, account numbers, IDs, notes, and sales. Use a trusted device, secure backups, and follow your employer's customer-data and privacy policies.
- Clearing browser/site data, using private browsing, changing browsers or addresses, or hitting storage limits can lose access to saved work. A storage failure is shown in the app. Export a backup regularly using **Data & settings → Export backup**; use **Restore backup** to validate and replace the current workspace with one you previously exported.
- Tabs on the same browser and origin listen for each other's changes, but concurrent edits are last-write-wins. This is not a multi-user database. Keep a backup before making large changes.
- Browser storage has finite, browser-dependent capacity. The lead table is paginated and queue lookups are indexed, but very large histories or a shared team deployment should use a more capable storage service.

## Typography

The interface is set in **Courier For The People** (SIL Open Font License) where it is installed, falling back to **Courier Prime** (bundled with the app, also OFL) and then the system Courier. Courier For The People is a heavier, true-italic remaster of Courier intended for screen use.

To ship Courier For The People with the app instead of relying on it being installed, put its files in `public/fonts/` (web fonts are best) and uncomment the `@font-face` block at the top of `src/styles.css`. Keep the font's OFL licence alongside it.

## Development and tests

```sh
npm test          # unit + React workflow tests
npm run build     # TypeScript check + production build
npm run preview   # serve the built site locally
```

See [architecture](docs/architecture.md) for the data model, queue rules and extension points, and [testing](docs/testing.md) for the automated coverage and a manual checklist.
