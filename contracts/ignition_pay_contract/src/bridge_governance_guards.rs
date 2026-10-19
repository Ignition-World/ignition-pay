//! Re-entrancy guard for `wrap` and Accepted-state check for `execute_proposal`
//! (CONTRACT-008, CONTRACT-010).
use soroban_sdk::{symbol_short, Env, Symbol};

const WRAP_LOCK_KEY: Symbol = symbol_short!("WRAPLOCK");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProposalStatus {
    Pending,
    Accepted,
    Rejected,
}

/// Call before the external token `transfer` in `wrap`; panics on re-entry.
pub fn lock_wrap(env: &Env) {
    if env.storage().temporary().has(&WRAP_LOCK_KEY) {
        panic!("wrap re-entrancy detected");
    }
    env.storage().temporary().set(&WRAP_LOCK_KEY, &true);
}

/// Call after the wrapped balance has been recorded.
pub fn unlock_wrap(env: &Env) {
    env.storage().temporary().remove(&WRAP_LOCK_KEY);
}

/// Call at the top of `execute_proposal`; only Accepted proposals may execute.
pub fn require_accepted(status: ProposalStatus) {
    if status != ProposalStatus::Accepted {
        panic!("proposal is not accepted");
    }
}
