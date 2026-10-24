# Product Requirements Document

Version 1.0 | Draft for product-owner approval

## Purpose and problem

Define outcomes, audience, scope and acceptance measures for SIS Companion. Warehouse staff need to know what an item is, where it is, how much is available, who requested or took it, and whether the application agrees with Zoho. Static QR text becomes stale; disconnected sheets and paper requests weaken accountability and planning.

## Goals and measures

| Goal | Proposed measure | Baseline/action |
|---|---|---|
| Find bin contents quickly | Median scan-to-result under 5 seconds on supported device/network | Establish pilot baseline |
| Trace stock changes | Every posted movement has actor, reason, time and source | Product/engineering owner |
| Prevent duplicate issue | No duplicate movement in retry/concurrency tests | Engineering acceptance |
| Improve accuracy | Weekly reconciliation variance measured | Set target after baseline |
| Account for equipment | Every loan has asset, borrower and condition | Warehouse owner |
| Recover service | Restore test meets approved RTO/RPO | Operations owner |

These targets are proposals requiring approval.

## Personas

**Driller:** request the right materials for a rig and return unused stock.  
**Warehouse manager:** see availability, reserve, approve, pick and issue reliably.  
**Receiver:** record deliveries into the correct bin per item, including partial/damaged quantities.  
**Equipment custodian:** identify who has each asset and whether it is safe to reissue.  
**Administrator:** manage access and integrations with audit and safe diagnostics.

## Product principles

1. QR identifies a stable bin; live content is resolved from the app.
2. Every posted stock change is attributable and traceable.
3. Each receipt line has its own bin assignment.
4. Warehouse access is enforced by the server.
5. Failed or uncertain sync is visible.
6. Camera scanning has manual search/code fallback.
7. Future mobile clients reuse the same API and rules.

## Scope and priority

**Must for controlled pilot:** authentication, role/warehouse rules, bin and item lookup, QR/manual entry, balances, request/approve/issue/return, per-line receiving, counts, movement history, audit and backup.

**Should for broad launch:** sandbox-proven Zoho import/write/reconciliation, equipment workflow, low-stock indicators, trips, rig kits, reservations and label batch tools.

**Later:** supplier purchase orders, demand forecast, push reminders, cost reporting and private native distribution.

## Non-goals

No anonymous detailed inventory, direct browser-to-Zoho calls, uncontrolled offline quantity changes, automatic supplier commitments, multi-tenant SaaS or replacement of Zoho finance/procurement.

## Acceptance

Pilot acceptance requires successful staff completion of core journeys, traceable stock movement, no cross-warehouse access, duplicate protection, physical label validation, successful backup restore and rollback exercise.

## Assumptions and questions

PWA-first is accepted direction. Zoho is an integration target, but authority policy is open. History references Queensland and NSW locations; production IDs must be confirmed. Retention, employee identity, approval thresholds and support coverage remain open.

