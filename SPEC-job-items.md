# Spec: Edit Job Items and Pricing on the Web

## Objective
Admins and managers can manage all products used on a job from its web details page. Changes keep stock, warranty records, invoices, and report totals consistent.

## Scope and Success Criteria
- Add an Edit Items action and an editable product table on Job Details.
- Load every used item, without the current 100-item truncation.
- Add catalogue items; edit quantity, serial number, warranty (0-5 years), and the selling price charged for this job; remove incorrectly recorded usage.
- Show each line amount and the material total before saving.
- Preserve the existing manual-item verification process for products outside the catalogue.
- Job-specific prices do not change inventory catalogue prices or purchase costs.
- Quantity increases consume available stock; decreases and removals return stock. Reject insufficient stock, duplicate serialized hardware, invalid quantities, and nonfinite or negative prices.
- Save stock adjustments, usage records, transaction history, linked daily-update product snapshots, and billing together using MongoDB transactions. Reject stale edits rather than overwrite another user's changes.
- Recalculate invoice and profit using existing billing rules, preserving service charges, collected payments, and AMC discounts. Removing the last item must reset material charges correctly.
- Refresh the job after save. Invoice PDFs, customer warranty views, and reports reflect the saved items and prices.
- Enforce admin/manager access in the API; technicians and sales cannot change prices through this feature.

## Tech Stack and Project Structure
- Existing React/Vite web application and installed table components in web/src/components/.
- Job UI: web/src/pages/Jobs/JobDetail.jsx and web/src/api/index.js.
- FastAPI job endpoints and validation: backend/app/routers/jobs.py and backend/app/models/.
- Existing MongoDB usage, stock, daily-update, billing, and AMC helpers; no new collection or package required.
- Regression checks in backend tests and web/tests/e2e/.

## Commands
- Web build, from web/: npm run build
- Browser checks, from web/: npx playwright test tests/e2e/job-items.spec.js --reporter=list
- Backend checks, from repository root: .venv/Scripts/python.exe -m pytest backend/tests/test_job_items.py

## Code Style
Reuse existing API, authorization, modal, and billing patterns. Keep validation on the server.

```python
quantity_used: float = Field(..., gt=0, allow_inf_nan=False)
unit_selling_price: float = Field(..., ge=0, allow_inf_nan=False)
```

## Testing Strategy
Use dummy records in an isolated transaction-capable MongoDB test database. Cover add/edit/remove, removing the last item, insufficient stock, rollback, stale saves, price isolation, AMC totals, and denied access. Browser checks cover editing, totals, errors, and saving. Tests must never alter production records.

## Boundaries
- Always: preserve existing inventory history and payments; log stock adjustments; validate every API input; use existing warranty and billing rules.
- Ask first: changing invoice calculation policy or expanding price-edit permissions beyond admins/managers.
- Never: overwrite catalogue prices, bypass manual-item verification, reset customer payments, or edit production data during tests.

## Assumptions for Review
Editing applies to both ongoing and completed jobs. Pricing means the selling price charged on this job; purchase costs remain managed in Inventory. New off-catalogue products continue through manual verification.
