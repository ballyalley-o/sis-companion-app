# Status reference

## Stock requests

| Status | Meaning | Next action |
| --- | --- | --- |
| Pending | Submitted for warehouse review. | Manager reviews quantities and bins. |
| Awaiting purchase | A shortage-only SIS purchase draft exists. | Arrange and link the Zoho PO, receive stock, then approve. |
| Processing | An approval is being processed. | Wait for completion; do not submit a duplicate action. |
| Approved | The request's approval completed. | Review the audit trail and stock movement. |
| Rejected | Warehouse review declined the request. | Read the reason and correct the request if needed. |
| Cancelled | The pending request was cancelled. | Submit a new request if still required. |

## Equipment

| Status | Meaning |
| --- | --- |
| Available | The unit is available in the app. Confirm physical readiness. |
| Signed out | A current loan records a holder and rig. |
| Overdue | The unit remains out beyond its due date. |
| Maintenance | The unit needs attention before release. |

Reserved and In transit appeared in temporary process planning. Do not assume they are implemented as equipment loan actions in this app.

## Mock and live

Mock or demo labels identify simulated data or integration behaviour. Live indicates an active integration mode; different operations still have different write behaviour. Consult the relevant workflow guide before acting.
