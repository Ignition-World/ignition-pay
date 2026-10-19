//! Initialization validation (CONTRACT-017, CONTRACT-019).
use soroban_sdk::{Address, Env, Symbol, Vec};

/// Call at the top of `MultiOracle::initialize`: an empty oracle set is rejected.
pub fn validate_oracle_set(oracles: &Vec<Address>) {
    if oracles.is_empty() {
        panic!("oracle set must not be empty");
    }
}

/// Call in `WrappedAssetBridge::initialize`: the native asset must answer `decimals`.
pub fn validate_native_asset(env: &Env, asset: &Address) {
    let result = env.try_invoke_contract::<u32, soroban_sdk::Error>(
        asset,
        &Symbol::new(env, "decimals"),
        Vec::new(env),
    );
    if !matches!(result, Ok(Ok(_))) {
        panic!("native asset is not a token contract");
    }
}
