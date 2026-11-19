# Review stock requests

For warehouse managers and administrators.

## Review before approval

1. Open More, then Stock requests.
2. Select a pending request and confirm the driller, rig, warehouse, items, and bins.
3. Review quantities against available stock. If the selected bin is short, check whether another bin holds the item.
4. Approve only when the complete request can be fulfilled from the selected bins.
5. If the request is incorrect, reject it with an explanation for the driller.

## Approval changes stock

Normal stock-request approval follows the existing stock-adjustment integration for the configured Zoho mode. Do not treat all actions in the app as read-only simply because purchase-order lookup is read-only.

## If purchasing is necessary

Select Request purchase in the request's shortage panel. The app prepares a shortage-only internal draft and records Awaiting purchase.

[Continue with shortage purchasing](../purchasing/).

## Complete the request

After the delivery has been received into the requested bins, open the original request and approve it. The awaiting-purchase flow requires a linked Zoho PO. Stock and request state are checked again before fulfilment.

This flow fulfils the full request. It does not record a partial issue of the stock already on hand.
