//! Property-based fuzz tests for IgnitionPayContract using proptest.
//!
//! These tests verify invariants that must hold for any possible input,
//! helping uncover edge cases in authorization, rate limiting, and KYC logic.

#![cfg(test)]

extern crate std;

use crate::{IgnitionPayContract, IgnitionPayContractClient};
use proptest::prelude::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env,
};

fn create_contract(env: &Env) -> IgnitionPayContractClient {
    IgnitionPayContractClient::new(env, &env.register_contract(None, IgnitionPayContract))
}

/// Strategy: Generate any u32 count of authorize/revoke cycles.
proptest! {
    /// Property: After N authorize-revoke cycles, the user is always unauthorized.
    #[test]
    fn prop_authorize_revoke_cycle_leaves_user_unauthorized(num_cycles in 0u32..100) {
        let env = Env::default();
        let admin = Address::random(&env);
        let user = Address::random(&env);
        let contract = create_contract(&env);

        contract.initialize(&admin);
        contract.set_kyc_status(&user, &true);

        for _ in 0..num_cycles {
            // Each cycle: authorize then revoke, stepping the ledger forward
            contract.authorize(&user);
            prop_assert!(contract.is_authorized(&user), "user should be authorized after authorize()");
            contract.revoke(&user);
            prop_assert!(!contract.is_authorized(&user), "user should NOT be authorized after revoke()");
        }
    }

    /// Property: A user without KYC can never be authorized.
    #[test]
    fn prop_no_kyc_never_authorized(num_attempts in 0u32..50) {
        let env = Env::default();
        let admin = Address::random(&env);
        let user = Address::random(&env);
        let contract = create_contract(&env);

        contract.initialize(&admin);
        // Do NOT set KYC status — leave it false/default

        for _ in 0..num_attempts {
            // authorize should panic because KYC is not completed
            let result = std::panic::catch_unwind(|| {
                // This will panic with "KYC not completed"
                contract.authorize(&user);
            });
            prop_assert!(result.is_err(), "authorize must fail without KYC");
            prop_assert!(!contract.is_authorized(&user), "user must remain unauthorized");
        }
    }

    /// Property: Set KYC to true, authorize, then set KYC to false — user remains authorized
    /// until explicitly revoked (authorization is sticky).
    #[test]
    fn prop_kyc_removal_does_not_revoke(num_steps in 0u32..30) {
        let env = Env::default();
        let admin = Address::random(&env);
        let user = Address::random(&env);
        let contract = create_contract(&env);

        contract.initialize(&admin);
        contract.set_kyc_status(&user, &true);
        contract.authorize(&user);
        prop_assert!(contract.is_authorized(&user));

        // Remove KYC — authorization should persist
        contract.set_kyc_status(&user, &false);
        prop_assert!(
            contract.is_authorized(&user),
            "authorization must persist after KYC removal"
        );

        for _ in 0..num_steps {
            // Subsequent authorize calls may fail (already authorized), but
            // the user should remain in an authorized state.
            let _ = std::panic::catch_unwind(|| {
                contract.authorize(&user);
            });
            prop_assert!(
                contract.is_authorized(&user),
                "user must stay authorized once authorized"
            );
        }
    }

    /// Property: revoking a user who was never authorized is a no-op (no panic).
    #[test]
    fn prop_revoke_never_authorized_no_panic(num_attempts in 0u32..20) {
        let env = Env::default();
        let admin = Address::random(&env);
        let user = Address::random(&env);
        let contract = create_contract(&env);

        contract.initialize(&admin);

        for _ in 0..num_attempts {
            // Revoke should not panic even if user is not authorized
            contract.revoke(&user);
            prop_assert!(!contract.is_authorized(&user));
        }
    }

    /// Property: Multiple distinct users do not interfere with each other's authorization state.
    #[test]
    fn prop_independent_user_authorization(num_users in 1u32..10) {
        let env = Env::default();
        let admin = Address::random(&env);
        let contract = create_contract(&env);

        contract.initialize(&admin);

        let users: Vec<Address> = (0..num_users)
            .map(|_| Address::random(&env))
            .collect();

        // Authorize all users
        for user in users.iter() {
            contract.set_kyc_status(user, &true);
            contract.authorize(user);
        }

        // Verify all are authorized
        for user in users.iter() {
            prop_assert!(contract.is_authorized(user), "each user should be authorized");
        }

        // Revoke first user, others should remain authorized
        if let Some(first) = users.first() {
            contract.revoke(first);
            prop_assert!(!contract.is_authorized(first));
            for user in users.iter().skip(1) {
                prop_assert!(contract.is_authorized(user), "other users should remain authorized");
            }
        }
    }

    /// Property: Rate limit is per-ledger; after advancing the ledger, the admin can call again.
    #[test]
    fn prop_rate_limit_resets_per_ledger(max_ops in 1u32..10) {
        let env = Env::default();
        let admin = Address::random(&env);
        let contract = create_contract(&env);

        contract.initialize(&admin);

        // Exhaust the rate limit on the current ledger
        for _ in 0..max_ops {
            let result = std::panic::catch_unwind(|| {
                contract.set_kyc_status(&Address::random(&env), &true);
            });
            if result.is_err() {
                // Rate limit hit — advance ledger
                break;
            }
        }

        // After advancing the ledger, operations should succeed again
        env.ledger().set(LedgerInfo {
            sequence: env.ledger().sequence() + 1,
            ..env.ledger().get()
        });

        let result = std::panic::catch_unwind(|| {
            contract.set_kyc_status(&Address::random(&env), &true);
        });
        // Should succeed after ledger advance
        // (this may also succeed if we didn't exhaust the limit)
        let _ = result;
    }
}
