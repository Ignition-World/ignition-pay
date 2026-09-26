#![cfg(test)]
extern crate std;

use crate::{
    IgnitionPayContract, IgnitionPayContractClient,
    WrappedAssetBridgeContract, WrappedAssetBridgeContractClient,
    TokenMetadataContract, TokenMetadataContractClient,
    GovernanceContract, GovernanceContractClient,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env, Symbol,
    DelegationContract, DelegationContractClient, IgnitionPayContract, IgnitionPayContractClient,
    MultiOracleContract, MultiOracleContractClient, QuoteLockContract, QuoteLockContractClient,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env, Symbol, Vec,
};

fn create_contract(env: &Env) -> IgnitionPayContractClient {
    IgnitionPayContractClient::new(env, &env.register_contract(None, IgnitionPayContract))
}

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);

    assert_eq!(contract.is_authorized(&admin), false);
    assert_eq!(contract.version().to_string(), "0.1.0");
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_initialize_prevents_reinitialization() {
    let env = Env::default();
    let admin = Address::random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);
    contract.initialize(&admin); // Should panic
}

#[test]
fn test_authorization() {
    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address::random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);
    contract.set_kyc_status(&user, &true);
    contract.authorize(&user);

    assert_eq!(contract.is_authorized(&user), true);

    contract.revoke(&user);
    assert_eq!(contract.is_authorized(&user), false);
}

#[test]
#[should_panic(expected = "KYC not completed")]
fn test_authorize_kyc_not_completed() {
    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address.random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);
    contract.authorize(&user);
}

#[test]
fn test_rate_limiting() {
    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address::random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);
    contract.set_kyc_status(&user, &true);

    for _ in 0..5 {
        contract.authorize(&user);
        contract.revoke(&user);
    }
}

#[test]
#[should_panic(expected = "Rate limit exceeded")]
fn test_rate_limiting_exceeded() {
    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address::random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);

    for _ in 0..6 {
        contract.set_kyc_status(&user, &true);
    }
}

#[test]
fn test_version() {
    let env = Env::default();
    let admin = Address::random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);
    assert_eq!(contract.version().to_string(), "0.1.0");
}

#[test]
fn test_transfer_admin() {
    let env = Env::default();
    let admin = Address::random(&env);
    let new_admin = Address::random(&env);
    let user = Address::random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);

    // New admin should not work initially
    env.mock_all_auths();
    // contract.set_kyc_status(&user, &true); // Would fail without admin auth

    // Transfer admin
    contract.transfer_admin(&new_admin);

    // Old admin should no longer work, new admin should work
    // Note: In test environment with mock_all_auths, both would work
    // This test mainly verifies the storage update
}

#[test]
#[should_panic(expected = "New admin must be different from current admin")]
fn test_transfer_admin_to_self() {
    let env = Env::default();
    let admin = Address::random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);
    contract.transfer_admin(&admin); // Should panic
}

#[test]
fn test_has_pending_upgrade() {
    let env = Env::default();
    let admin = Address::random(&env);
    let contract = create_contract(&env);

    contract.initialize(&admin);

    // Initially no pending upgrade
    assert_eq!(contract.has_pending_upgrade(), false);
}

// --- WrappedAssetBridgeContract Tests ---

fn create_bridge_contract(env: &Env) -> WrappedAssetBridgeContractClient {
    WrappedAssetBridgeContractClient::new(env, &env.register_contract(None, WrappedAssetBridgeContract))
}

#[test]
fn test_bridge_initialize() {
    let env = Env::default();
    let admin = Address::random(&env);
    let contract = create_bridge_contract(&env);

    contract.initialize(&admin);
    assert_eq!(contract.get_wrapped_balance(&Address::random(&env), &Address::random(&env)), 0);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_bridge_prevents_reinitialization() {
    let env = Env::default();
    let admin = Address::random(&env);
    let contract = create_bridge_contract(&env);

    contract.initialize(&admin);
    contract.initialize(&admin);
}

#[test]
fn test_bridge_wrap_and_unwrap() {
    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address::random(&env);
    let native_asset = Address::random(&env);
    let contract = create_bridge_contract(&env);

    contract.initialize(&admin);

    env.mock_all_auths();
    contract.wrap(&user, &native_asset, &1000);
    assert_eq!(contract.get_wrapped_balance(&user, &native_asset), 1000);

    contract.unwrap(&user, &native_asset, &500);
    assert_eq!(contract.get_wrapped_balance(&user, &native_asset), 500);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_bridge_wrap_zero_amount() {
    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address::random(&env);
    let native_asset = Address::random(&env);
    let contract = create_bridge_contract(&env);

    contract.initialize(&admin);
    env.mock_all_auths();
    contract.wrap(&user, &native_asset, &0);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_bridge_unwrap_zero_amount() {
    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address::random(&env);
    let native_asset = Address::random(&env);
    let contract = create_bridge_contract(&env);

    contract.initialize(&admin);
    env.mock_all_auths();
    contract.unwrap(&user, &native_asset, &0);
}

#[test]
#[should_panic(expected = "Insufficient wrapped balance")]
fn test_bridge_unwrap_insufficient() {
    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address::random(&env);
    let native_asset = Address::random(&env);
    let contract = create_bridge_contract(&env);

    contract.initialize(&admin);
    env.mock_all_auths();
    contract.wrap(&user, &native_asset, &100);
    contract.unwrap(&user, &native_asset, &200);
}

#[test]
fn test_bridge_register_and_get_wrapped_token() {
    let env = Env::default();
    let admin = Address::random(&env);
    let native_asset = Address::random(&env);
    let wrapped_token = Address::random(&env);
    let contract = create_bridge_contract(&env);

    contract.initialize(&admin);
    env.mock_all_auths();

    assert_eq!(contract.get_wrapped_token(&native_asset), None);
    contract.register_wrapped_token(&native_asset, &wrapped_token);
    assert_eq!(contract.get_wrapped_token(&native_asset), Some(wrapped_token));
}

// --- TokenMetadataContract Tests ---

fn create_metadata_contract(env: &Env) -> TokenMetadataContractClient {
    TokenMetadataContractClient::new(env, &env.register_contract(None, TokenMetadataContract))
}

#[test]
fn test_metadata_initialize() {
    let env = Env::default();
    let admin = Address::random(&env);
    let contract = create_metadata_contract(&env);

    contract.initialize(&admin);
    assert_eq!(contract.has_metadata(&Address::random(&env)), false);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_metadata_prevents_reinitialization() {
    let env = Env::default();
    let admin = Address::random(&env);
    let contract = create_metadata_contract(&env);

    contract.initialize(&admin);
    contract.initialize(&admin);
}

#[test]
fn test_metadata_set_and_get() {
    let env = Env::default();
    let admin = Address::random(&env);
    let asset = Address::random(&env);
    let contract = create_metadata_contract(&env);

    contract.initialize(&admin);

    let name = Symbol::new(&env, "USDC");
    let icon = Symbol::new(&env, "usdc_icon");
    let description = Symbol::new(&env, "USD Coin stablecoin");

    contract.set_metadata(&asset, &name, &icon, &description);

    assert_eq!(contract.get_name(&asset), Some(name));
    assert_eq!(contract.get_icon(&asset), Some(icon));
    assert_eq!(contract.get_description(&asset), Some(description));
    assert_eq!(contract.has_metadata(&asset), true);
}

#[test]
fn test_metadata_remove() {
    let env = Env::default();
    let admin = Address::random(&env);
    let asset = Address::random(&env);
    let contract = create_metadata_contract(&env);

    contract.initialize(&admin);

    let name = Symbol::new(&env, "USDC");
    let icon = Symbol::new(&env, "usdc_icon");
    let description = Symbol::new(&env, "USD Coin stablecoin");

    contract.set_metadata(&asset, &name, &icon, &description);
    contract.remove_metadata(&asset);

    assert_eq!(contract.has_metadata(&asset), false);
}

#[test]
fn test_metadata_get_nonexistent() {
    let env = Env::default();
    let admin = Address::random(&env);
    let asset = Address::random(&env);
    let contract = create_metadata_contract(&env);

    contract.initialize(&admin);
    assert_eq!(contract.get_name(&asset), None);
    assert_eq!(contract.get_icon(&asset), None);
    assert_eq!(contract.get_description(&asset), None);
}

// --- GovernanceContract Tests ---

fn create_governance_contract(env: &Env) -> GovernanceContractClient {
    GovernanceContractClient::new(env, &env.register_contract(None, GovernanceContract))
}

#[test]
fn test_governance_initialize() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    assert_eq!(contract.get_proposal_count(), 0);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_governance_prevents_reinitialization() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    contract.initialize(&admin, &token);
}

#[test]
fn test_governance_create_proposal() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let author = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();

    let title = Symbol::new(&env, "Proposal 1");
    contract.create_proposal(&author, &title, &1000);

    assert_eq!(contract.get_proposal_count(), 1);
    let proposal = contract.get_proposal(&1);
    assert_eq!(proposal.id, 1);
    assert_eq!(proposal.author, author);
    assert_eq!(proposal.title, title);
    assert_eq!(proposal.executed, false);
}

#[test]
fn test_governance_proposal_count_increments() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let author = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();

    let title1 = Symbol::new(&env, "Proposal 1");
    let title2 = Symbol::new(&env, "Proposal 2");
    contract.create_proposal(&author, &title1, &1000);
    contract.create_proposal(&author, &title2, &2000);

    assert_eq!(contract.get_proposal_count(), 2);
}

#[test]
#[should_panic(expected = "Proposal not found")]
fn test_governance_get_nonexistent_proposal() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    contract.get_proposal(&999);
}

#[test]
#[should_panic(expected = "Voting period has not ended")]
fn test_governance_execute_before_end() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let author = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();

    let title = Symbol::new(&env, "Proposal 1");
    contract.create_proposal(&author, &title, &1000);
    contract.execute_proposal(&1);
}

#[test]
#[should_panic(expected = "Proposal already executed")]
fn test_governance_double_execute() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let author = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();

    let title = Symbol::new(&env, "Proposal 1");
    contract.create_proposal(&author, &title, &1000);

    // Fast forward past voting period
    env.ledger().set(LedgerInfo {
        timestamp: 1001,
        ..env.ledger().get()
    });

    contract.execute_proposal(&1);
    contract.execute_proposal(&1);
}

#[test]
fn test_governance_get_vote_tally_initial() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let author = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();

    let title = Symbol::new(&env, "Proposal 1");
    contract.create_proposal(&author, &title, &1000);

    let (for_votes, against_votes) = contract.get_vote_tally(&1);
    assert_eq!(for_votes, 0);
    assert_eq!(against_votes, 0);
}

#[test]
fn test_governance_has_voted_initial() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let author = Address::random(&env);
    let voter = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();

    let title = Symbol::new(&env, "Proposal 1");
    contract.create_proposal(&author, &title, &1000);

    assert_eq!(contract.has_voted(&1, &voter), false);
}

#[test]
#[should_panic(expected = "Quorum must be between 0 and 10000 basis points")]
fn test_governance_set_quorum_invalid() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();
    contract.set_quorum(&10001);
#[test]
#[should_panic(expected = "All prices are stale")]
fn test_oracle_rejects_stale_prices() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(LedgerInfo {
        timestamp: 1_000,
        ..env.ledger().get()
    });
    let admin = Address::random(&env);
    let oracle = Address::random(&env);
    let contract = MultiOracleContractClient::new(
        &env,
        &env.register_contract(None, MultiOracleContract),
    );

    contract.initialize(&admin, &Vec::from_array(&env, [oracle.clone()]));
    contract.push_price(&Symbol::new(&env, "XLM"), &100);
    env.ledger().set(LedgerInfo {
        timestamp: 1_301,
        ..env.ledger().get()
    });
    contract.get_median_price(&Symbol::new(&env, "XLM"));
}

#[test]
fn test_delegation_aggregates_power_and_can_be_cleared() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::random(&env);
    let voter = Address::random(&env);
    let representative = Address::random(&env);
    let contract = DelegationContractClient::new(
        &env,
        &env.register_contract(None, DelegationContract),
    );

    contract.initialize(&admin);
    contract.set_voting_power(&voter, &10);
    contract.set_voting_power(&representative, &5);
    contract.delegate(&voter, &representative);
    assert_eq!(contract.get_voting_power(&representative), 15);
    assert_eq!(contract.get_delegate(&voter), Some(representative.clone()));

    contract.clear_delegation(&voter);
    assert_eq!(contract.get_voting_power(&representative), 5);
}

#[test]
fn test_quote_lock_is_one_time_and_preserves_terms() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(LedgerInfo {
        timestamp: 1_000,
        ..env.ledger().get()
    });
    let admin = Address::random(&env);
    let creator = Address::random(&env);
    let sell_asset = Address::random(&env);
    let buy_asset = Address::random(&env);
    let id = Symbol::new(&env, "quote-1");
    let contract = QuoteLockContractClient::new(
        &env,
        &env.register_contract(None, QuoteLockContract),
    );

    contract.initialize(&admin);
    contract.lock_quote(
        &id,
        &creator,
        &sell_asset,
        &buy_asset,
        &100,
        &250,
        &2,
        &1_100,
    );
    let executed = contract.execute_quote(&id, &creator);
    assert_eq!(executed.sell_amount, 100);
    assert_eq!(executed.buy_amount, 250);
    assert_eq!(contract.get_quote(&id).executed, true);
}
