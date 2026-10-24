# SIS Companion Engineering Documentation

Version 1.0 | Prepared 24 October 2026 | Draft baseline pending source audit and owner approval

This package defines the product and engineering baseline for SIS Companion, the Site Investigation Supply warehouse application.

Documents: 00-master-engineering-specification.md; 01-repository-evidence.md; 02-prd.md; 03-srs.md; 04-architecture-data-model.md; 05-zoho-integration.md; 06-qr-bin-inventory.md; 07-security.md; 08-quality.md; 09-deployment-operations.md; 10-adrs.md; 11-backlog-roadmap.md; 12-production-readiness.md.

Status labels: Verified in repository source means source was inspected; Reported in repository history means a dated commit/development report describes it; Observed in preview means manually observed in a named deployment; Planned is a target; Unknown/unverified means evidence is insufficient. A commit message does not prove current source behavior, production availability, security or user acceptance.

Evidence boundary: public repository https://github.com/ballyalley-o/sis-companion-app, default branch main. On 24 October 2026, metadata was available, README content was empty and code search returned no indexed matches. History includes feature reports through 19 October and a README-removal commit on 22 October. Current source tree, deployed preview, secrets, runtime health, PWA installability and live Zoho remain unverified.

PWA-first is the agreed direction, with possible later private mobile distribution. History refers to Expo/React Native and web preview; compatibility with a production PWA is an early release gate.

