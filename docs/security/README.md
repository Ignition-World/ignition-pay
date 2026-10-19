# Security Documentation — IgnitionPay Contracts

This directory contains security-related documentation for the IgnitionPay Soroban smart contracts, prepared for third-party security audit.

## Documents

| Document | Description |
|----------|-------------|
| [Threat Model](./threat-model.md) | Comprehensive threat model including attack surface, threat actors, and mitigations |
| [Security Specification](./security-spec.md) | Formal audit-ready specification of contract behavior, access control, and invariants |

## Quick Reference

### Key Security Properties

1. **Authorization Gating:** Only KYC'd users can be authorized by the admin
2. **Rate Limiting:** Admin is limited to 5 state-mutating calls per ledger
3. **Atomic State:** All state changes are transactional
4. **Auth Enforcement:** All privileged operations require cryptographic authorization

### Known Risks (Pre-Audit)

| ID | Risk | Severity | Status |
|----|------|----------|--------|
| TH-01 | Missing initialize re-entrancy guard | High | Open |
| TH-02 | No admin transfer/recovery | Critical | Open |
| TH-04 | Unbounded authorization list growth | Medium | Open |
| TH-05 | KYC revocation doesn't auto-revoke auth | Low | Open |
| TH-06 | No event emission for state changes | Medium | Open |

### Audit Preparation

- [ ] Resolve all open threats in threat model
- [ ] Complete fuzz test coverage (TASK1)
- [ ] Implement upgrade mechanism (TASK3)
- [ ] Implement bytecode verification (TASK4)
- [ ] Pin all dependency versions
- [ ] Schedule third-party audit

## Contacts

For security-related inquiries, refer to the team's internal communication channels.
