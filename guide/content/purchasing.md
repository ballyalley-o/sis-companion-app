# Purchase missing stock

For warehouse managers and administrators.

## End-to-end flow

```flow
Driller submits full request
Manager reviews warehouse shortage
SIS prepares purchase draft
Authorised buyer creates and sends PO in Zoho
Manager links the Zoho PO reference
Warehouse receives stock into requested bins
Manager approves original request
```

## How the quantity is calculated

Purchase quantity is total demand for the product minus stock available across the selected warehouse. Repeated product lines are combined.

| Requested | Warehouse stock | To purchase |
| --- | --- | --- |
| 10 units | 6 units | 4 units |

Enough stock in another bin means the warehouse is not short. Arrange stock in the requested bins instead of ordering extra.

## Prepare and link the purchase

1. Open the stock request and review Stock shortage.
2. Select Request purchase.
3. Note the internal PUR reference and the quantities to buy.
4. Create, approve, and send the actual PO in Zoho through your normal purchasing process.
5. Enter the PO number or reference under Zoho PO reference and select Link Zoho PO.

The app checks that the linked order covers the draft's products and quantities. Demo and cancelled orders cannot be linked.

## What is not automatic

SIS currently stores an internal purchase draft. It does not create or send a PO in Zoho, choose suppliers, or set prices. Linking does not verify supplier approval or quantities allocated to other requests.

Draft quantities are a review-time snapshot. They do not reserve stock or automatically recalculate an existing draft.

Receiving does not automatically approve the original request. [Receive the order](../receiving/), then complete warehouse approval.
