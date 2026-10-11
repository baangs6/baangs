# AMC policy

An AMC belongs to a customer ID and a location. Location matching ignores case,
outer whitespace and repeated spaces; it does not merge different addresses or
customers merely because their phone numbers match.

- One calendar year, ending the day before the anniversary (inclusive end date).
- First four completed linked service jobs waive service charges.
- Fifth and later completed jobs are chargeable; the contract remains active.
- Replacement products receive 10% off their recorded selling-price subtotal
  throughout the active year, including extra visits.
- The admin must link the job before completion. Installation jobs cannot link.
- The admin explicitly marks jobs whose billed products are all replacements.
  Leave this off for new equipment sales; mixed replacement/new-equipment bills
  should be separate jobs. Warranty replacements remain a separate process.
- Completion freezes eligibility and pricing benefits. Renewals and expiry do not
  rewrite old invoices. Reopening/re-completing the same job is not another visit.
- A revision-checked ledger serializes concurrent completion claims. Cancelling
  a contract preserves historical visits and discounts already awarded.
- Start/in-progress/cancelled job updates do not consume a visit. Completion via
  status updates, direct job edits or billing all uses the same policy.
- Contract amount is recorded separately and is not added to job revenue.

Website: Customer details > Annual Maintenance Contract > Add / Renew AMC.
Job details > Annual Maintenance Contract > select contract and save before
completion. Mobile has the same controls in customer and job details; technicians
can view only contracts relevant to their assigned jobs, not change contracts.

Tests: `python -m pytest tests/test_amc.py -q`.
Deploy the backend and web changes; build a new APK to distribute mobile changes.
