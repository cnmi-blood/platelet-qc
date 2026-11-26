# v5.3.60 — pH Pending Alert & Schedule

Base: GitHub ZIP supplied by user, v5.3.59. No database migration required.

- Include scheduled, due, overdue and missing-expiry pH in pending measurement bag count. One record = one pending bag even if multiple measurements missing. Includes Prepare and QC since 2026-10-01; deleted and pre-start records excluded. Existing backlog uses its established October 2026 floor.
- Home: prominent pH panel (first four pending pH bags; open Platelet for all) and staff task shortcut. Platelet dashboard: full visible list above weekly QC, with expiry dates and quick pH entry using existing permissions. Separate today / overdue / upcoming / unknown expiry.
- Backlog: pH filter includes scheduled work; one record-level job for combined missing measurements. Submitted QC stays in physician-review group; note missing pH if applicable. Weekly missing QC jobs remain independent. No automatic change of QC criteria, pH timing or CAPA, KPI A, records or evidence.
- Direct entry opens existing record and focuses pH field using original permission checks. No new tables or SQL.

## Install
Extract UPDATE ONLY and upload app.js, styles.css, index.html, sw.js and this note to the existing GitHub repository root; commit and hard refresh (Ctrl+F5). Verify footer v5.3.60.

## Tests
Node syntax check for app.js and sw.js. Chromium with synthetic data and fixed Bangkok date 26 Nov 2026: 2 future pH bags (QC + Prepare) visible on both dashboards; backlog staff ph filter/route and quick action state passed; due/overdue/unknown dates and no duplicate combined CBC/ADAM/pH job passed; pre-Oct and deleted records excluded; simulated saved pH removes pending reminder; submitted QC with missing pH remains physician task. Mobile viewport 390px no horizontal overflow. No page errors. Browser test bypassed login and stubbed route for quick-entry test; actual Supabase saving, evidence upload and iPhone device not tested. Actual total depends on production data. Backup is original program ZIP, not database backup.
