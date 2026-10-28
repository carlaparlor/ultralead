# Testing

## Automated checks

Run from the repository root with Node.js 22.12+:

```sh
npm ci
npm test
npm run build
npm audit
```

The Vitest suite covers:

- Supplied tab-separated format, spaces, malformed rows, duplicate/conflicting accounts, 3,000-row batches, Active/Archived/60+ filtering and unknown-age review.
- Birthday boundaries, leap dates, local-day formatting and invalid IDs.
- Per-workspace daily shuffling, due callbacks, cooldowns, three-attempt limits, fresh-lead priority, not-interested persistence, manual reset and expiry at age 60.
- Callback upserts, sale stage transitions and duplicate protection, editable package, and the rule that ATT/non-ATT is only recorded at activation (an activation without a type is rejected, and an unactivated sale cannot carry one). Selective per-record and per-category deletion.
- Local persistence, same-origin tab updates, backup validation, corrupt/unavailable storage and clipboard fallback/failure.
- Customer notes and call history reachable and editable from All leads, Callbacks, Sales pipeline and Activations, including after a sale and after an activation.
- React workflows from import through age review, callback, sale, vetting, confirmation and activation; paste-anywhere import with undo; remembered replace/add choice; notes surviving list replacement; the `N`/`X`/`C`/`S`/`V` shortcuts and arrow-key cycling; pagination; date filters; and the callback-due/clipboard timing boundary.
- Axe accessibility smoke checks for the calling desk and import dialog. The jsdom checks exclude colour contrast because jsdom has no layout; check contrast in a real browser too.

The production build also type-checks the application and tests. Tests use invented customer details and do not access an external calling system.

A real Chromium smoke pass was also used to check desktop/mobile layouts, backup export and restore, and Axe results across the principal views and dialogs. Automated accessibility tools cannot replace keyboard and assistive-technology testing.

## Manual acceptance checklist

1. Start the app in a fresh browser profile. Confirm **SAMPLE DATA** is visible and importing your own rows removes the sample records. Paste rows with nothing focused and confirm the list imports immediately, then use **UNDO** and confirm the previous workspace returns. Paste into the customer-notes field and confirm the note receives the text instead of an import.
2. Paste a mix of Prospect, Active, Archived, known 60+ and invalid/missing-ID rows. Check preview counts. Confirm only eligible rows enter the queue and that unknown ages require explicit review.
3. Copy a 5- number; paste it into a safe text field. Turn auto-copy off and on, then skip and log an outcome to check clipboard behaviour. Try a browser that denies clipboard permission and check that failure is visible.
4. Add a note, schedule a callback, replace the daily list and reload. Confirm both the callback and note survive. Check that a future callback stays out of the queue until due and that a no-answer callback is postponed.
5. Record a sale with a new package. Confirm no ATT/non-ATT choice is offered before vetting, that the pipeline shows "at activation", and that completing the activation asks for the type and cannot be submitted without it. Approve vetting, complete confirmation, check activation totals and the date filter, edit details, and move the activation back if needed.
6. Open the customer record from a lead, a callback, a sale in vetting and an activation. Confirm the notes match what was typed on the desk, that edits save, and that the call history lists each logged outcome.
7. Delete one lead, callback and activation separately. Use each category clear action after confirming the text; verify other categories survive. Check that returning a previously not-interested or deleted-sale lead requires confirmation.
7. Export a backup, change the workspace, restore the file, and verify the restored data. Attempt to restore invalid JSON and confirm nothing changes.
8. Check the calling desk, lists, dialogs and navigation at desktop and narrow mobile widths. Check keyboard focus, Escape to close a dialog, that arrow keys cycle the queue without logging anything, and that shortcuts do not fire while typing.
9. Open a second tab on the same origin and confirm ordinary edits appear in the other tab. Do not treat this as concurrent multi-user coordination.

Never use real customer data for automated tests. Clipboard permissions, browser storage quotas, private-browsing behaviour, and local time zones vary by browser and should be checked in the actual workplace environment.
