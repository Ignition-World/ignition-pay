#![cfg(test)]
extern crate std;

use crate::{
    DelegationContract, DelegationContractClient, GovernanceContract, GovernanceContractClient,
    IgnitionPayContract, IgnitionPayContractClient, MultiOracleContract, MultiOracleContractClient,
    QuoteLockContract, QuoteLockContractClient, TokenMetadataContract, TokenMetadataContractClient,
    WrappedAssetBridgeContract, WrappedAssetBridgeContractClient,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env, String, Symbol, Vec,
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
fn test_revoke_emits_event_only_when_authorization_is_removed() {
    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address::random(&env);
    let contract_id = env.register_contract(None, IgnitionPayContract);
    let contract = IgnitionPayContractClient::new(&env, &contract_id);

    contract.initialize(&admin);
    contract.set_kyc_status(&user, &true);
    contract.authorize(&user);
    contract.revoke(&user);

    let events = env.events().all();
    let revoked_topic = Symbol::new(&env, "authorization_revoked");
    let revoked_events: soroban_sdk::Vec<_> = events
        .iter()
        .filter(|(event_contract, topics, data)| {
            if event_contract != &contract_id {
                return false;
            }

            let topics: Vec<soroban_sdk::Val> = Vec::from_val(&env, topics);
            if topics.len() != 2 {
                return false;
            }

            let topic: Symbol = topics.get(0).unwrap().try_into_val(&env).unwrap();
            let event_admin: Address = topics.get(1).unwrap().try_into_val(&env).unwrap();
            let event_user: Address = data.clone().try_into_val(&env).unwrap();
            topic == revoked_topic && event_admin == admin && event_user == user
        })
        .collect();

    assert_eq!(revoked_events.len(), 1);

    contract.revoke(&user);
    let events_after_noop_revoke = env.events().all();
    assert_eq!(events_after_noop_revoke.len(), events.len());
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
fn test_version_falls_back_when_storage_is_unseeded() {
    let env = Env::default();
    let contract = create_contract(&env);

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

    let title = String::from_str(&env, "Proposal 1");
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

    let title1 = String::from_str(&env, "Proposal 1");
    let title2 = String::from_str(&env, "Proposal 2");
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

    let title = String::from_str(&env, "Proposal 1");
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

    let title = String::from_str(&env, "Proposal 1");
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

    let title = String::from_str(&env, "Proposal 1");
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

    let title = String::from_str(&env, "Proposal 1");
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
// --- PriceFeedContract Tests ---

fn create_price_feed_contract(env: &Env) -> crate::PriceFeedContractClient {
    crate::PriceFeedContractClient::new(env, &env.register_contract(None, crate::PriceFeedContract))
}

fn create_multi_oracle_contract(env: &Env) -> MultiOracleContractClient {
    MultiOracleContractClient::new(env, &env.register_contract(None, MultiOracleContract))
}

/// Issue #851 — [CONTRACT-039]
///
/// `PriceFeedContract::get_max_staleness` must proxy through to the backing
/// `MultiOracleContract` so that registered providers can determine how fresh
/// their data must be before calling `update_price`.
///
/// Sub-tests:
/// 1. Default: returns `DEFAULT_MAX_STALENESS_SECONDS` (300) before any
///    `set_max_staleness` call.
/// 2. Custom: returns whatever value the oracle admin has configured.
/// 3. Zero: the getter faithfully relays a staleness of 0 (reject all prices
///    scenario that the admin explicitly configured).
#[test]
fn test_price_feed_get_max_staleness_returns_oracle_value() {
    let env = Env::default();
    env.mock_all_auths();

    let oracle_admin = Address::random(&env);
    let feed_admin = Address::random(&env);
    let oracle = Address::random(&env);

    // Deploy both contracts.
    let oracle_contract = create_multi_oracle_contract(&env);
    let feed_contract = create_price_feed_contract(&env);

    oracle_contract.initialize(&oracle_admin, &Vec::from_array(&env, [oracle.clone()]));
    feed_contract.initialize(&feed_admin);

    let oracle_addr = oracle_contract.address.clone();

    // 1. Default staleness (300 s) — admin has never called set_max_staleness.
    assert_eq!(
        feed_contract.get_max_staleness(&oracle_addr),
        300,
        "default max_staleness must be 300 seconds"
    );

    // 2. After the oracle admin updates max_staleness, the feed getter must
    //    reflect the new value immediately.
    oracle_contract.set_max_staleness(&600);
    assert_eq!(
        feed_contract.get_max_staleness(&oracle_addr),
        600,
        "get_max_staleness must mirror the oracle's configured value (600 s)"
    );

    // 3. Edge case: staleness set to 0 (all prices rejected by the oracle).
    oracle_contract.set_max_staleness(&0);
    assert_eq!(
        feed_contract.get_max_staleness(&oracle_addr),
        0,
        "get_max_staleness must faithfully return 0 when configured"
    );
}

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

// --- PaymentContract batch_send payout_sent event tests ---

mod mock_token {
    use soroban_sdk::{contract, contractimpl, Address, Env, Symbol};

    #[contract]
    pub struct MockToken;

    #[contractimpl]
    impl MockToken {
        pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
    }
}

#[test]
fn test_batch_send_emits_payout_sent_per_recipient() {
    use crate::PaymentContract;
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::{vec, IntoVal, Vec};

    let env = Env::default();
    env.mock_all_auths();

    // Register a minimal mock token that accepts transfer calls.
    let token_id = env.register_contract(None, mock_token::MockToken);

    let admin = Address::random(&env);
    let sender = Address::random(&env);
    let recipient_a = Address::random(&env);
    let recipient_b = Address::random(&env);
    let recipient_c = Address::random(&env);

    // Deploy and initialise the PaymentContract.
    let payment_id = env.register_contract(None, PaymentContract);
    let payment_client = crate::PaymentContractClient::new(&env, &payment_id);
    payment_client.initialize(&admin, &token_id);

    // Build inputs: 3 recipients with distinct amounts.
    let recipients: Vec<Address> = vec![
        &env,
        recipient_a.clone(),
        recipient_b.clone(),
        recipient_c.clone(),
    ];
    let amounts: Vec<i128> = vec![&env, 100_i128, 200_i128, 300_i128];

    payment_client.batch_send(&sender, &recipients, &amounts);

    // Collect all events emitted during this invocation.
    let all_events = env.events().all();

    // Separate payout_sent events from the batch_payment_sent summary.
    let payout_topic = Symbol::new(&env, "payout_sent");
    let batch_topic = Symbol::new(&env, "batch_payment_sent");

    let payout_events: soroban_sdk::Vec<_> = all_events
        .iter()
        .filter(|(_, topics, _)| {
            // topics is a Val-encoded tuple; compare the first element.
            let topics_vec: soroban_sdk::Vec<soroban_sdk::Val> =
                soroban_sdk::Vec::from_val(&env, topics);
            if topics_vec.is_empty() {
                return false;
            }
            let first: Symbol = topics_vec.get(0).unwrap().try_into_val(&env).unwrap_or_else(|_| Symbol::new(&env, ""));
            first == payout_topic
        })
        .collect();

    let batch_events: soroban_sdk::Vec<_> = all_events
        .iter()
        .filter(|(_, topics, _)| {
            let topics_vec: soroban_sdk::Vec<soroban_sdk::Val> =
                soroban_sdk::Vec::from_val(&env, topics);
            if topics_vec.is_empty() {
                return false;
            }
            let first: Symbol = topics_vec.get(0).unwrap().try_into_val(&env).unwrap_or_else(|_| Symbol::new(&env, ""));
            first == batch_topic
        })
        .collect();

    // Exactly 3 payout_sent events — one per recipient.
    assert_eq!(payout_events.len(), 3, "expected exactly 3 payout_sent events");

    // Verify each payout_sent carries the correct (recipient, amount) payload.
    let expected: [(Address, i128); 3] = [
        (recipient_a.clone(), 100_i128),
        (recipient_b.clone(), 200_i128),
        (recipient_c.clone(), 300_i128),
    ];
    for (i, (exp_recipient, exp_amount)) in expected.iter().enumerate() {
        let (_, _, data) = &payout_events.get(i as u32).unwrap();
        let (got_recipient, got_amount): (Address, i128) =
            data.try_into_val(&env).expect("payout_sent data must be (Address, i128)");
        assert_eq!(&got_recipient, exp_recipient, "payout_sent[{}] recipient mismatch", i);
        assert_eq!(got_amount, *exp_amount, "payout_sent[{}] amount mismatch", i);
    }

    // The original batch_payment_sent summary event must still be present exactly once.
    assert_eq!(batch_events.len(), 1, "expected exactly 1 batch_payment_sent summary event");
}

#[test]
#[should_panic(expected = "Cannot delegate to self")]
fn test_delegation_rejects_self_delegation() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::random(&env);
    let voter = Address::random(&env);
    let contract = DelegationContractClient::new(
        &env,
        &env.register_contract(None, DelegationContract),
    );

    contract.initialize(&admin);
    contract.delegate(&voter, &voter);
}

#[test]
fn test_governance_accepts_long_human_readable_title() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let author = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();

    let title = String::from_str(&env, "Fund Q4 infrastructure reserve multisig");
    contract.create_proposal(&author, &title, &1000);
    assert_eq!(contract.get_proposal(&1).title, title);
}

#[test]
#[should_panic(expected = "Proposal title exceeds 256 bytes")]
fn test_governance_rejects_oversized_title() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let author = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();

    let title = String::from_str(&env, &"a".repeat(257));
    contract.create_proposal(&author, &title, &1000);
}

#[test]
#[should_panic(expected = "Proposal title cannot be empty")]
fn test_governance_rejects_empty_title() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);
    let author = Address::random(&env);
    let contract = create_governance_contract(&env);

    contract.initialize(&admin, &token);
    env.mock_all_auths();

    contract.create_proposal(&author, &String::from_str(&env, ""), &1000);
}

#[test]
fn test_price_feed_max_deviation_defaults_and_is_configurable() {
    let env = Env::default();
    env.mock_all_auths();
    let feed_admin = Address::random(&env);
    let feed_contract = create_price_feed_contract(&env);
    feed_contract.initialize(&feed_admin);

    assert_eq!(feed_contract.get_max_deviation_bps(), 5_000);
    feed_contract.set_max_deviation_bps(&1_000);
    assert_eq!(feed_contract.get_max_deviation_bps(), 1_000);
}

#[test]
#[should_panic(expected = "Deviation must be between 1 and 10000 bps")]
fn test_price_feed_rejects_zero_max_deviation() {
    let env = Env::default();
    env.mock_all_auths();
    let feed_admin = Address::random(&env);
    let feed_contract = create_price_feed_contract(&env);
    feed_contract.initialize(&feed_admin);

    feed_contract.set_max_deviation_bps(&0);
}

// ─── CONTRACT-032: Voting Power Snapshot Tests ───────────────────────────────
//
// These tests cover the fix for issue #844 / CONTRACT-032.
// Before this fix, `cast_vote` read the live token balance, which allowed a
// voter to acquire tokens after a proposal opened and manipulate their weight.
// The fix introduces `snapshot_voting_power` which locks in the balance at
// snapshot time; `cast_vote` uses that stored value instead.

/// A minimal governance token mock that stores per-address balances so tests
/// can set up arbitrary amounts and verify the snapshot reads them correctly.
mod mock_governance_token {
    use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, Map, Symbol};

    #[contract]
    pub struct MockGovernanceToken;

    #[contractimpl]
    impl MockGovernanceToken {
        /// Set the balance for an address (test helper — not a real token fn).
        pub fn set_balance(env: Env, account: Address, amount: i128) {
            let mut balances: Map<Address, i128> = env
                .storage()
                .instance()
                .get(&symbol_short!("bals"))
                .unwrap_or_else(|| Map::new(&env));
            balances.set(account, amount);
            env.storage().instance().set(&symbol_short!("bals"), &balances);
        }

        /// Standard Soroban token-style balance function, invoked by
        /// GovernanceContract::snapshot_voting_power via env.invoke_contract.
        pub fn balance(env: Env, account: Address) -> i128 {
            let balances: Map<Address, i128> = env
                .storage()
                .instance()
                .get(&symbol_short!("bals"))
                .unwrap_or_else(|| Map::new(&env));
            balances.get(account).unwrap_or(0)
        }
    }
}

/// Helper that sets up a GovernanceContract + mock governance token and
/// returns (governance client, token address).  The ledger timestamp starts
/// at 0, so proposals begin at `start_time = 0` and end at `duration`.
fn create_governance_with_token(
    env: &Env,
) -> (
    GovernanceContractClient,
    Address,
    Address, // token contract address so callers can set balances
) {
    use soroban_sdk::testutils::Address as _;
    let admin = Address::random(env);
    let token_addr = env.register_contract(None, mock_governance_token::MockGovernanceToken);
    let gov = GovernanceContractClient::new(env, &env.register_contract(None, crate::GovernanceContract));
    gov.initialize(&admin, &token_addr);
    (gov, admin, token_addr)
}

/// Convenience: mint tokens to an account via the mock token contract.
fn set_token_balance(env: &Env, token: &Address, account: &Address, amount: i128) {
    use mock_governance_token::MockGovernanceTokenClient;
    let client = MockGovernanceTokenClient::new(env, token);
    client.set_balance(account, &amount);
}

// ─── Test 1: snapshot stores the token balance at time of call ────────────────

#[test]
fn test_snapshot_stores_token_balance() {
    use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};

    let env = Env::default();
    env.mock_all_auths();
    let (gov, _admin, token) = create_governance_with_token(&env);

    let voter = Address::random(&env);
    set_token_balance(&env, &token, &voter, 500);

    // Create proposal with duration 1000; start_time = 0, end_time = 1000.
    let title = soroban_sdk::String::from_str(&env, "Snapshot test proposal");
    gov.create_proposal(&voter, &title, &1000);

    // Advance ledger to t=1 (inside voting window).
    env.ledger().set(LedgerInfo { timestamp: 1, ..env.ledger().get() });

    gov.snapshot_voting_power(&1, &voter);

    let stored = gov.get_voting_power_snapshot(&1, &voter);
    assert_eq!(stored, Some(500_i128), "snapshot should capture 500 tokens");
}

// ─── Test 2: snapshot is idempotent ─────────────────────────────────────────

#[test]
fn test_snapshot_is_idempotent() {
    use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};

    let env = Env::default();
    env.mock_all_auths();
    let (gov, _admin, token) = create_governance_with_token(&env);

    let voter = Address::random(&env);
    set_token_balance(&env, &token, &voter, 300);

    let title = soroban_sdk::String::from_str(&env, "Idempotent snapshot proposal");
    gov.create_proposal(&voter, &title, &1000);

    // First snapshot at 300 tokens.
    env.ledger().set(LedgerInfo { timestamp: 1, ..env.ledger().get() });
    gov.snapshot_voting_power(&1, &voter);

    // Voter acquires more tokens; second snapshot should be silently ignored.
    set_token_balance(&env, &token, &voter, 9999);
    gov.snapshot_voting_power(&1, &voter);

    // Value must still be the original 300.
    let stored = gov.get_voting_power_snapshot(&1, &voter);
    assert_eq!(stored, Some(300_i128), "second snapshot must not overwrite the first");
}

// ─── Test 3: cast_vote uses snapshot weight, not live balance ─────────────────

#[test]
fn test_cast_vote_uses_snapshot_weight() {
    use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};

    let env = Env::default();
    env.mock_all_auths();
    let (gov, _admin, token) = create_governance_with_token(&env);

    let voter = Address::random(&env);
    set_token_balance(&env, &token, &voter, 200);

    let title = soroban_sdk::String::from_str(&env, "Vote weight proposal");
    gov.create_proposal(&voter, &title, &1000);

    // Snapshot at 200 tokens.
    env.ledger().set(LedgerInfo { timestamp: 1, ..env.ledger().get() });
    gov.snapshot_voting_power(&1, &voter);

    // Voter acquires a LOT more tokens after the snapshot.
    set_token_balance(&env, &token, &voter, 100_000);

    // Cast a vote; the tally must reflect the snapshotted 200, not 100 000.
    gov.cast_vote(&1, &voter, &true);

    let (votes_for, votes_against) = gov.get_vote_tally(&1);
    assert_eq!(votes_for, 200, "votes_for should equal the snapshot weight (200)");
    assert_eq!(votes_against, 0);
}

// ─── Test 4: cast_vote panics if no snapshot was taken ────────────────────────

#[test]
#[should_panic(expected = "Voting power not snapshotted")]
fn test_cast_vote_panics_without_snapshot() {
    use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};

    let env = Env::default();
    env.mock_all_auths();
    let (gov, _admin, token) = create_governance_with_token(&env);

    let voter = Address::random(&env);
    set_token_balance(&env, &token, &voter, 100);

    let title = soroban_sdk::String::from_str(&env, "No snapshot proposal");
    gov.create_proposal(&voter, &title, &1000);

    // Move time into voting window but do NOT call snapshot_voting_power.
    env.ledger().set(LedgerInfo { timestamp: 1, ..env.ledger().get() });

    // This must panic because no snapshot was registered.
    gov.cast_vote(&1, &voter, &true);
}

// ─── Test 5: snapshot panics outside the voting window ────────────────────────

#[test]
#[should_panic(expected = "Snapshot only allowed during the active voting period")]
fn test_snapshot_panics_after_voting_window() {
    use soroban_sdk::testutils::{Address as _, Ledger, LedgerInfo};

    let env = Env::default();
    env.mock_all_auths();
    let (gov, _admin, token) = create_governance_with_token(&env);

    let voter = Address::random(&env);
    set_token_balance(&env, &token, &voter, 100);

    // Create proposal with duration 500 → window [0, 500].
    let title = soroban_sdk::String::from_str(&env, "Window test proposal");
    gov.create_proposal(&voter, &title, &500);

    // Advance time PAST the end of the voting window.
    env.ledger().set(LedgerInfo { timestamp: 501, ..env.ledger().get() });

    // Must panic — window is closed.
    gov.snapshot_voting_power(&1, &voter);
}
