//! Overflow-safe milestone release and event-before-write admin transfer
//! (CONTRACT-005, CONTRACT-006).
use soroban_sdk::{Address, Env, Symbol};

const BPS_DENOMINATOR: i128 = 10_000;

/// Amount to release for the bps delta, or `None` on overflow or an invalid delta.
pub fn release_amount(amount: i128, percentage_bps: u32, released_bps: u32) -> Option<i128> {
    let delta = percentage_bps.checked_sub(released_bps)?;
    amount.checked_mul(delta as i128)?.checked_div(BPS_DENOMINATOR)
}

/// Publishes `admin_transferred` first, then writes the new admin.
pub fn transfer_admin_emitting_first(
    env: &Env,
    admin_key: &Symbol,
    current: &Address,
    new_admin: &Address,
) {
    current.require_auth();
    env.events().publish(
        (Symbol::new(env, "admin_transferred"), current.clone()),
        new_admin.clone(),
    );
    env.storage().instance().set(admin_key, new_admin);
}
