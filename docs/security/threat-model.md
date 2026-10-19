# Threat Model — IgnitionPay Soroban Contract

**Version:** 1.0  
**Date:** 2026-08-25  
**Status:** Audit Preparation  

---

## 1. Overview

This document defines the threat model for the `ignition-pay-contract` Soroban smart contract. It enumerates the attack surface, trust boundaries, threat actors, and security invariants that must hold before mainnet deployment.

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Stellar Network                         │
│  ┌──────────────────────────────────────────────────────┐ │
│  │          ignition-pay-contract (WASM)                │ │
│  │                                                      │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │ │
│  │  │  Admin    │  │ KYC Status   │  │ Authorization │  │ │
│  │  │  (owner)  │  │ Registry     │  │ List          │  │ │
│  │  └──────────┘  └──────────────┘  └───────────────┘  │ │
│  │                                                      │ │
│  │  ┌──────────────────────────────────────────────┐    │ │
│  │  │  Rate Limiter (per-ledger, per-user)         │    │ │
│  │  └──────────────────────────────────────────────┘    │ │
│  └──────────────────────────────────────────────────────┘ │
│                          ▲                                │
│          ┌───────────────┼───────────────┐                │
│          │               │               │                │
│     ┌────┴────┐   ┌─────┴─────┐   ┌────┴─────┐          │
│     │  Admin  │   │  Users    │   │ Off-chain │          │
│     │ Signer  │   │ (KYC'd)   │   │ Services  │          │
│     └─────────┘   └───────────┘   └───────────┘          │
└──────────────────────────────────────────────────────────┘
```

## 3. Trust Boundaries

| Boundary | Description |
|----------|-------------|
| **TB-1** | Contract boundary — all entry points are untrusted input from external callers |
| **TB-2** | Admin vs. Users — admin has elevated privileges (KYC, auth management) |
| **TB-3** | On-chain vs. Off-chain — off-chain services may submit transactions impersonating users |
| **TB-4** | Contract upgrade boundary — WASM bytecode must match audited source |

## 4. Threat Actors

### 4.1 Malicious Users (T1)
- **Capability:** Submit arbitrary transactions to any public contract method
- **Motivation:** Gain unauthorized access, bypass KYC, drain funds
- **Access Level:** Low (no special privileges)

### 4.2 Compromised Admin Key (T2)
- **Capability:** Full admin access — set KYC status, authorize/revoke any user
- **Motivation:** Unauthorized authorization grants, denial of service
- **Access Level:** High (admin signer compromised)

### 4.3 Network-Level Adversary (T3)
- **Capability:** Observe and manipulate transaction ordering (MEV/front-running)
- **Motivation:** Extract value, cause state inconsistencies
- **Access Level:** Network level

### 4.4 Contract Upgrade Attacker (T4)
- **Capability:** Replace contract WASM with malicious bytecode
- **Motivation:** Full control of contract state and funds
- **Access Level:** Requires admin key + upgrade mechanism access

## 5. Attack Surface

### 5.1 Entry Points

| Method | Auth Required | Risk Level | Description |
|--------|--------------|------------|-------------|
| `initialize` | None (once) | **Critical** | Sets admin and initial state. Must be idempotent-safe. |
| `set_kyc_status` | Admin auth | **High** | Grants/revokes KYC status for any address. |
| `authorize` | Admin auth | **High** | Grants authorization; requires KYC. Rate-limited. |
| `revoke` | Admin auth | **Medium** | Removes authorization; rate-limited. |
| `is_authorized` | None | **Low** | Read-only query, no state modification. |

### 5.2 State Storage

| Key | Type | Sensitivity |
|-----|------|-------------|
| `admin` | `Address` | **Critical** — sole admin authority |
| `authorizations` | `Vec<Address>` | **High** — list of authorized users |
| `rate_limit` | `Map<Address, (u32, u32)>` | **Medium** — rate limit tracking |
| `kyc_status` | `Map<Address, bool>` | **High** — KYC gate for authorization |

## 6. Identified Threats & Mitigations

### TH-01: Missing Authorization on `initialize`
- **Risk:** Any account could call `initialize` and set themselves as admin before the real admin.
- **Mitigation:** `initialize` must be called exactly once. Consider constructor-style initialization via `env.register_contract` or admin-provided auth.
- **Status:** ⚠️ Requires review — current implementation has no guard against re-initialization.

### TH-02: No Admin Transfer / Recovery
- **Risk:** If the admin key is lost or compromised, the contract is permanently bricked or hijacked.
- **Mitigation:** Implement admin transfer with timelock or multi-sig requirement.
- **Status:** ❌ Not implemented — **must be addressed before mainnet.**

### TH-03: Rate Limit Bypass via Ledger Manipulation
- **Risk:** An admin could theoretically manipulate ledger advancement to reset rate limits.
- **Mitigation:** Rate limiting relies on `env.ledger().sequence()` which is set by the network. Admin cannot influence this.
- **Status:** ✅ Safe — ledger sequence is tamper-proof.

### TH-04: Authorization List Growth (Storage Exhaustion)
- **Risk:** Repeated `authorize` calls without `revoke` grow the `authorizations` Vec unboundedly, increasing rent costs.
- **Mitigation:** Add a max authorization count, or use a Map for O(1) dedup checks.
- **Status:** ⚠️ Not mitigated — potential DoS vector.

### TH-05: KYC Status Not Tied to Authorization Lifecycle
- **Risk:** Revoking KYC does not automatically revoke existing authorizations.
- **Mitigation:** Either (a) document this as expected behavior, or (b) add a sweep function that de-authorizes all users who lose KYC.
- **Status:** ⚠️ Design decision needed.

### TH-06: No Event/Log Emission
- **Risk:** Off-chain systems cannot observe state changes (authorization grants/revokes, KYC changes).
- **Mitigation:** Emit `ContractEvent` for all state-changing operations.
- **Status:** ❌ Not implemented.

### TH-07: Upgrade Mechanism Missing
- **Risk:** If a bug is found post-deployment, the contract must be redeployed with full state migration.
- **Mitigation:** Implement Soroban's `upgradeable` contract pattern for safe upgrades.
- **Status:** ❌ Not implemented (see TASK3).

### TH-08: WASM Bytecode Not Verified Against Source
- **Risk:** Deployed WASM may differ from audited source code.
- **Mitigation:** Add CI/CD reproducible build and hash verification.
- **Status:** ❌ Not implemented (see TASK4).

## 7. Security Invariants

These invariants must hold at all times and are enforced by the fuzz tests (TASK1):

1. **INV-1:** A user without KYC can never be authorized.
2. **INV-2:** After `revoke(user)`, `is_authorized(user) == false`.
3. **INV-3:** Authorization is sticky — revoking KYC does not automatically revoke existing authorizations.
4. **INV-4:** Rate limit is per-ledger and cannot be bypassed.
5. **INV-5:** Only the admin can modify KYC status and authorization list.
6. **INV-6:** Revoking a never-authorized user does not panic.

## 8. Audit Readiness Checklist

- [ ] Resolve TH-01 (initialize guard)
- [ ] Resolve TH-02 (admin transfer/recovery)
- [ ] Resolve TH-04 (storage exhaustion)
- [ ] Resolve TH-05 (KYC-authorization lifecycle)
- [ ] Resolve TH-06 (event emission)
- [ ] Implement contract upgrade path (TASK3)
- [ ] Implement bytecode verification (TASK4)
- [ ] Complete fuzz test suite (TASK1)
- [ ] Pin dependency versions (no semver ranges)
- [ ] Write formal specification (see security-spec.md)
- [ ] Third-party audit engagement

## 9. Recommended Audit Scope

1. **Static Analysis:** Slither/Clippy for Soroban-specific lints
2. **Formal Verification:** Model-checking of authorization state machine
3. **Fuzz Testing Review:** Validate proptest properties cover edge cases
4. **Upgrade Safety:** Verify upgrade path cannot introduce storage corruption
5. **Economic Analysis:** Rent costs, rate limit effectiveness, storage growth
6. **Access Control Review:** Admin key management, auth boundary enforcement
