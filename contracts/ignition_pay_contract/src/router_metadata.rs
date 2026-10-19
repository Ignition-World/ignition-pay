//! Router transfer without a redundant auth check, and String-based token metadata
//! (CONTRACT-011, CONTRACT-016).
use soroban_sdk::{contracttype, Address, Env, IntoVal, String, Symbol};

const MAX_ICON_BYTES: u32 = 2048;
const MAX_DESCRIPTION_BYTES: u32 = 1024;

/// Forwards the transfer; the token contract asserts `from` auth itself, so the
/// router does not call `from.require_auth()` first.
pub fn router_transfer(env: &Env, token: &Address, from: &Address, to: &Address, amount: i128) {
    env.invoke_contract::<()>(
        token,
        &Symbol::new(env, "transfer"),
        (from.clone(), to.clone(), amount).into_val(env),
    );
}

/// Metadata stored as `String` so URLs and multi-word text are not truncated.
#[contracttype]
#[derive(Clone)]
pub struct TokenMetadata {
    pub icon: String,
    pub description: String,
}

pub fn new_metadata(icon: String, description: String) -> TokenMetadata {
    if icon.len() > MAX_ICON_BYTES || description.len() > MAX_DESCRIPTION_BYTES {
        panic!("metadata too long");
    }
    TokenMetadata { icon, description }
}
