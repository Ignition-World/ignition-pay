//! Oracle authorization and staleness checks (CONTRACT-003, CONTRACT-004).
use soroban_sdk::{Address, Env, Vec};

/// Call at the top of `push_price`: the caller must be a registered oracle and authorize.
pub fn require_registered_oracle(oracles: &Vec<Address>, oracle: &Address) {
    if !oracles.contains(oracle) {
        panic!("not a registered oracle");
    }
    oracle.require_auth();
}

/// Call in `get_median_price`: rejects an observation older than `max_staleness`.
pub fn ensure_fresh(env: &Env, observed_at: u64, max_staleness: u64) {
    let age = env.ledger().timestamp().saturating_sub(observed_at);
    if age > max_staleness {
        panic!("price is stale");
    }
}
