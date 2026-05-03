# P0 QA Test Report

## Project/App Name
- Baangs FSM (Backend APIs)

## Environment Tested
- Local backend: `http://127.0.0.1:8000`
- Web/mobile clients connected locally (`127.0.0.1`)
- Database mode during tests: mock fallback/local test data
- OS: Windows (local dev machine)

## Test Date/Time
- 2026-05-03 10:47:56 +05:30

## Test Framework
- `pytest`

## Execution Summary
- Total tests: **14**
- Passed: **14**
- Failed: **0**

## Coverage Summary
- P0 backend API coverage includes:
  - Authentication and authorization
  - Role-based access restrictions
  - Staff creation and user deletion
  - Attendance check-in/check-out persistence (GPS, remarks, photo URL fields)
  - Admin attendance visibility (technician details + photo URLs)
  - Leave apply/approve flows
  - Payroll P0 rule verification (2 paid leaves/month, extra unpaid)
  - Job flow with technician status updates and invoice persistence via updates/billing linkage
  - Invalid ID error handling

## P0 Test Case Results
| ID | Scenario | Result |
|---|---|---|
| P0-AUTH-001 | Admin login succeeds | PASS |
| P0-AUTH-002 | Technician web login blocked (mobile-only policy) | PASS |
| P0-AUTH-003 | Protected endpoint requires JWT | PASS |
| P0-STAFF-001 | Admin can create staff | PASS |
| P0-LEAVE-001 | Technician applies leave and admin approves | PASS |
| P0-PAYROLL-001 | Payroll enforces 2 paid leave days, rest unpaid | PASS |
| P0-USER-001 | Admin can delete user | PASS |
| P0-ATT-001 | Technician check-in/check-out persists GPS/remarks/photo URL fields | PASS |
| P0-ATT-002 | Admin attendance list returns technician details + photo URLs | PASS |
| P0-JOB-001 | Job flow: create, assign, technician update, invoice persistence | PASS |
| P0-AUTHZ-001 | Technician cannot access admin attendance list | PASS |
| P0-AUTHZ-002 | Technician cannot create staff | PASS |
| P0-AUTHZ-003 | Unauthenticated access blocked for jobs/staff/payroll | PASS |
| P0-ERR-001 | Invalid IDs return proper 404 errors | PASS |

## Bugs Found
- None blocking.

## Warnings / Non-Blocking Risks
1. `datetime.utcnow()` deprecation warning in JWT path.
2. Pydantic `model_number` protected namespace warning.

## Release Recommendation (Backend P0 APIs)
- **Recommended for backend P0 API release** based on current automated coverage and pass results.
- Proceed with caution on non-blocking warnings; schedule fixes in next hardening pass.

## Next Recommended Testing
- Mobile UI end-to-end validation
- Real-device GPS/camera testing (Android/iOS)
- Notification end-to-end validation (admin + technician)
- Web E2E automation for critical user journeys
