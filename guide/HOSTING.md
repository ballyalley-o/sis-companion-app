# Staff-only documentation hosting

Intended domain: `doc.siscompanion.com.au`. Domain ownership, DNS, hosting, TLS, and the staff identity policy are not configured by these source files.

## Agreed access and domain plan

- Identity: Microsoft work accounts through the organisation's Microsoft Entra ID tenant.
- Audience: approved staff, preferably an explicitly assigned Entra group, rather than everyone with any Microsoft account.
- Future domain: `doc.siscompanion.com.au`. The parent domain is not registered yet; do not treat this hostname as live.
- Interim hosting: use a temporary hostname only after an identity gate protects the entire site and all alternate origins. The domain can be connected later without changing guide content.

Before configuring the identity gate, obtain the organisation's Entra tenant ID, an authorised administrator, the staff group or assignment policy, and a selected hosting/access provider. The provider determines the app registration and callback URL. Keep any client secret in the provider's secret store, never in this repository or the frontend build variables.

This is the selected design, not an implemented Microsoft sign-in integration. The static site does not authenticate users by itself. Hosting-level Microsoft authentication still needs configuration and a staff/outsider access test. Successful Microsoft sign-in to documentation does not create an SIS app account or grant an SIS role.

## Before deployment

1. Confirm ownership of `siscompanion.com.au` and access to its DNS account.
2. Create a separate documentation project from the same repository, root directory `guide`, preset Other, build command `python3 build.py`, output directory `dist`.
3. Before uploading content, enable an identity-based staff gate covering **all deployments**, including the production custom domain and preview aliases. An app sign-in session is not automatically recognised by another host.
4. Configure Microsoft Entra ID and the approved-staff assignment policy with the chosen access provider. If using Vercel deployment protection, verify that the selected plan supports the required production-domain protection and staff access. Do not assume a protected preview also protects the production domain. An identity proxy is another deployment option, but must also close access through alternate hostnames.
5. Verify that signed-out visitors cannot retrieve a guide URL, `/asset/search.json`, or a static asset. Verify allowed staff can sign in and unauthorised accounts are denied.
6. Add `doc.siscompanion.com.au` to the project and copy the exact DNS record requested by the hosting provider into the DNS account. Use the current provider's target rather than a hard-coded example.
7. Wait for domain verification and HTTPS issuance. Recheck access through the custom domain and every alternate deployment URL.

A shared password, `robots.txt`, and an unlinked URL are not a staff membership policy.

## Link from the app

After the restricted site is live:

```dotenv
EXPO_PUBLIC_DOCUMENTATION_URL=https://doc.siscompanion.com.au
```

Rebuild the frontend or native binary to introduce/change the help link. Staff then open **More → Help centre**. The system browser handles the documentation identity gate; staff may need to sign in separately. The app does not include its bearer token in the URL.

Later edits to guide content require only a documentation deployment, not another mobile app release. If embedded help or one shared sign-in session is needed later, implement and review that authentication bridge explicitly.

## App Store support

Keep detailed warehouse workflows staff-only. Plan a separate accessible support/contact page for the App Store listing, with real contact details and the appropriate privacy-policy link. Do not invent a support address or treat a private guide as the only way to request help.

Apple references:

- https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/
- https://developer.apple.com/app-store/review/

## Acceptance checks

- Staff access approved and revocable; unauthorised visitors denied on all origins.
- No HTML, assets, or search index available without the identity gate.
- Domain resolves, HTTPS works, and the app opens the intended host.
- Mobile menu, keyboard search, table scrolling, and printing reviewed.
- Guide labels match the deployed app; source-reviewed behaviour is not presented as live acceptance.
