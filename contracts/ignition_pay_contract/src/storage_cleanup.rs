//! Removes map entries instead of storing tombstones (CONTRACT-007, CONTRACT-009).
use soroban_sdk::{Address, Map};

/// Deletes the asset key so the allowlist does not grow with `false` tombstones.
pub fn remove_asset_entry(assets: &mut Map<Address, bool>, asset: &Address) {
    assets.remove(asset.clone());
}

/// Deletes the `(asset, account)` trustline key instead of setting it to `false`.
pub fn remove_trustline_entry(
    trustlines: &mut Map<(Address, Address), bool>,
    asset: &Address,
    account: &Address,
) {
    trustlines.remove((asset.clone(), account.clone()));
}
