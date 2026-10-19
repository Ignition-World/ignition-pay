# Security Specification — IgnitionPay Soroban Contract

**Version:** 1.0  
**Date:** 2026-08-25  
**Purpose:** Formal audit-ready specification for third-party security review

---

## 1. Contract Identity

| Field | Value |
|-------|-------|
| **Name** | `ignition-pay-contract` |
| **Soroban SDK** | `20.3.1` |
| **Network** | Stellar Mainnet (preparation) |
| **WASM Hash** | *(to be filled after audit build)* |

## 2. Functional Specification

### 2.1 State Variables

| Variable | Storage Key | Type | Access Control |
|----------|------------|------|----------------|
| `admin` | `"admin"` | `Address` | Write: once during init. Read: always. |
| `authorizations` | `"authorizations"` | `Vec<Address>` | Write: admin only. Read: always. |
| `rate_limit` | `"rate_limit"` | `Map<Address, (u32, u32)>` | Write: internal (check_rate_limit). Read: internal. |
| `kyc_status` | `"kyc_status"` | `Map<Address, bool>` | Write: admin only. Read: always. |

### 2.2 Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_CALLS_PER_LEDGER` | `5` | Maximum admin calls per ledger sequence |

### 2.3 Method Specifications

#### `initialize(admin: Address)`

**Preconditions:**
- Contract must not have been previously initialized
- `admin` must be a valid address

**Postconditions:**
- `storage["admin"] == admin`
- `storage["authorizations"] == []` (empty Vec)
- `storage["rate_limit"] == {}` (empty Map)
- `storage["kyc_status"] == {}` (empty Map)

**Side Effects:** Writes 4 storage slots.

**Security Note:** ⚠️ Currently lacks re-initialization guard. See TH-01 in threat model.

---

#### `set_kyc_status(user: Address, kyc_completed: bool)`

**Preconditions:**
- Caller must be the admin (`require_auth()`)
- Rate limit must not be exceeded for this ledger

**Postconditions:**
- `storage["kyc_status"][user] == kyc_completed`

**Side Effects:** Writes `kyc_status` map, updates `rate_limit` map.

**Invariants:**
- Only admin can call this function
- Rate limit is enforced before state mutation

---

#### `authorize(user: Address)`

**Preconditions:**
- Caller must be the admin (`require_auth()`)
- Rate limit must not be exceeded
- `storage["kyc_status"][user] == true`

**Postconditions:**
- `storage["authorizations"]` contains `user`

**Side Effects:** Appends to `authorizations` Vec, updates `rate_limit`.

**Invariants:**
- INV-1: User must have KYC completed
- INV-2: Rate limit is enforced

---

#### `revoke(user: Address)`

**Preconditions:**
- Caller must be the admin (`require_auth()`)
- Rate limit must not be exceeded

**Postconditions:**
- `storage["authorizations"]` does not contain `user`

**Side Effects:** Removes from `authorizations` Vec, updates `rate_limit`.

**Invariants:**
- INV-3: No panic if user is not in the list (graceful no-op)
- INV-4: Rate limit is enforced

---

#### `is_authorized(user: Address) -> bool`

**Preconditions:** None

**Postconditions:**
- Returns `true` if and only if `user ∈ storage["authorizations"]`

**Side Effects:** None (pure read).

---

### 2.4 Rate Limiter Specification

```
fn check_rate_limit(admin: Address):
    current_ledger = env.ledger().sequence()
    (last_ledger, count) = rate_limit[admin] or (0, 0)
    
    if last_ledger == current_ledger:
        if count >= MAX_CALLS_PER_LEDGER:
            panic("Rate limit exceeded")
        rate_limit[admin] = (current_ledger, count + 1)
    else:
        rate_limit[admin] = (current_ledger, 1)
```

**Properties:**
- Rate limit is per-ledger, per-user (currently only admin is rate-limited)
- Resets automatically on ledger advancement
- Maximum of 5 state-mutating admin calls per ledger

## 3. Access Control Matrix

| Method | Caller | Required Auth | Rate Limited | Can Modify Auth List | Can Modify KYC |
|--------|--------|---------------|-------------|---------------------|----------------|
| `initialize` | Anyone | No | No | Indirectly (sets admin) | Indirectly |
| `set_kyc_status` | Admin | Yes | Yes | No | Yes |
| `authorize` | Admin | Yes | Yes | Yes | No |
| `revoke` | Admin | Yes | Yes | Yes | No |
| `is_authorized` | Anyone | No | No | No | No |

## 4. Non-Functional Requirements

### 4.1 Performance
- All methods must execute within a single ledger's compute budget
- Storage reads/writes must not exceed Soroban rent costs budget

### 4.2 Data Integrity
- All state mutations are atomic (Soroban transactional model)
- No partial state updates on panic

### 4.3 Availability
- Rate limiting must not permanently lock out the admin (resets per ledger)
- Contract must remain functional after admin key rotation (when implemented)

## 5. Known Limitations

1. **No admin transfer:** If the admin key is lost, the contract is permanently locked.
2. **Unbounded authorization list:** No upper limit on the number of authorized users.
3. **Stale KYC not propagated:** Revoking KYC does not auto-revoke existing authorizations.
4. **No event emission:** Off-chain indexers cannot observe state changes.
5. **Single admin:** No multi-sig or DAO governance support.

## 6. Test Coverage Requirements

| Category | Minimum Coverage | Tool |
|----------|-----------------|------|
| Unit tests | All public methods | `cargo test` |
| Property-based tests | All invariants | `proptest` (TASK1) |
| Fuzz testing | Entry point safety | `cargo-fuzz` (TASK1) |
| Edge cases | Panic conditions, boundary values | Proptest strategies |

## 7. Deployment Checklist

- [ ] Audit completed and all findings addressed
- [ ] WASM built from pinned, audited source commit
- [ ] WASM hash recorded and verified against CI build
- [ ] Admin key secured in hardware wallet / multi-sig
- [ ] Contract deployed via official deployment script
- [ ] Post-deployment smoke test passed
- [ ] Upgrade mechanism tested on testnet
- [ ] Monitoring and alerting configured
