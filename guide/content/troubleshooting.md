# Troubleshooting

## I submitted access details but cannot see a request

Use an administrator account to open Users & roles and select Refresh. An email already registered as a user does not appear as a pending request. Confirm the invitation link and the app use the same backend deployment. Do not send your password in a support message.

## The app says No connection

Confirm the app address and network connection. If other staff also cannot connect, ask the deployment administrator to check the backend readiness endpoint and the frontend's configured API origin. A local backend requires the host computer to be running.

## Approval fails because stock is insufficient

Check the selected bins, not just the warehouse total. If the warehouse is short, prepare a purchase draft. If stock is in a different bin, arrange the physical and recorded stock location before approving.

## The purchase order will not link

Confirm the exact PO number or reference, Live mode, local product mapping, and coverage of every draft quantity. A cancelled or demo PO is rejected. The selected warehouse must be within your access scope.

## The map has no location

Confirm the warehouse and item identity. The item may have no recorded stock bin or equipment home bin. Ask warehouse staff to correct the recorded location rather than treating a missing marker as zero physical stock.

## The QR camera does not open

Check browser camera permission and use a supported secure connection. A phone viewing a plain HTTP LAN address may not have camera access. Follow your deployment's supported scanning procedure.

## Report an issue

Provide the app version, short build revision, screen name, warehouse, request or equipment reference, and what happened. Include a screenshot without passwords, tokens, or personal information that is not needed for the report.
