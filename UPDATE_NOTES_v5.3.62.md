# v5.3.62 — Ai-LIS Document Evidence Fix

Base: v5.3.61 FULL. Scope: shared weekly no-product evidence dialog (RBC Post-Storage, Pool Platelet, SDP), including entry from backlog.

- Separate camera, photo gallery and document picker. Document picker explicitly accepts XLS, XLSX, CSV and PDF, with multi-select.
- At least one allowed non-empty evidence file is required; a document alone is sufficient. Reason and existing Unit requirement remain unchanged.
- File maximum remains 10 MB per file. Unsupported extensions and empty files rejected. Selected files can be removed before save.
- Use MIME mapped from supported extension, including when browser supplies blank or generic MIME. Documents retain original bytes, name and extension; image optimization remains available. Extension check does not certify file contents.
- Existing authenticated storage/metadata and reviewer acknowledgement remain unchanged; Excel and CSV can be downloaded from evidence review through a short-lived signed URL. No changes to QC counts, pH, KPI or Dashboard.
- Disable duplicate save clicks during upload, and show filename with upload error.

Installation: upload app.js, index.html, styles.css, sw.js and this note to GitHub root. Reload and verify v5.3.62. No required SQL change. If storage rejects a MIME type, inspect bucket MIME settings; optional SQL supplied separately adds four document MIME types to an existing restricted allowlist without changing existing entries, RLS, bucket privacy or size limits. It does not modify table CHECK constraints. If metadata insertion fails, inspect the returned CHECK constraints and report exact error.

Tests: Node syntax checks; mocked shared dialog save using XLS, XLSX, CSV, PDF, PNG; original bytes and MIME, document-only, multiple documents, no evidence, invalid/empty/oversize files and simulated upload rejection. Not tested in real browser file picker, iOS, live Supabase or reviewer download. Test files contain synthetic bytes; no workbook parsing or evidence authenticity verification is performed. Backup is source code, not database backup.
