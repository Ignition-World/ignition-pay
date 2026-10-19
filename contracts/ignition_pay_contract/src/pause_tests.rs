extern crate std;

use crate::{
    EscrowContract, EscrowContractClient, PausableContract, PausableContractClient,
    PaymentContract, PaymentContractClient, WrappedAssetBridgeContract,
    WrappedAssetBridgeContractClient,
};
use soroban_sdk::{testutils::Address as _, token, Address, Env, Symbol, Vec};

fn pausable(env: &Env, admin: &Address) -> PausableContractClient {
    let client = PausableContractClient::new(env, &env.register_contract(None, PausableContract));
    client.initialize(admin);
    client
}

#[test]
fn pausable_contract_rejects_unauthorized_pause_changes() {
    let env = Env::default();
    let admin = Address::random(&env);
    let pause = pausable(&env, &admin);

    assert!(pause.try_pause().is_err());
    assert!(!pause.is_paused());
    assert!(pause.try_unpause().is_err());
    assert!(!pause.is_paused());
}

#[test]
fn payment_operations_are_blocked_without_partial_transfers_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::random(&env);
    let sender = Address::random(&env);
    let recipient = Address::random(&env);
    let second_recipient = Address::random(&env);
    let token_id = env.register_stellar_asset_contract(admin.clone());
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);
    let payment = PaymentContractClient::new(&env, &env.register_contract(None, PaymentContract));
    let pause = pausable(&env, &admin);

    payment.initialize(&admin, &token_id);
    payment.set_pausable_contract(&pause.address);
    token_admin.mint(&sender, &100);

    payment.send_payment(&sender, &recipient, &10, &Symbol::new(&env, "first"));
    assert_eq!(token_client.balance(&recipient), 10);
    assert_eq!(payment.get_payment_count(&sender), 1);

    pause.pause();
    let recipients = Vec::from_array(&env, [recipient.clone(), second_recipient.clone()]);
    let amounts = Vec::from_array(&env, [15_i128, 20_i128]);
    assert!(payment
        .try_send_payment(&sender, &recipient, &15, &Symbol::new(&env, "paused"))
        .is_err());
    assert!(payment.try_batch_send(&sender, &recipients, &amounts).is_err());
    assert_eq!(token_client.balance(&sender), 90);
    assert_eq!(token_client.balance(&recipient), 10);
    assert_eq!(token_client.balance(&second_recipient), 0);
    assert_eq!(payment.get_payment_count(&sender), 1);

    pause.unpause();
    payment.batch_send(&sender, &recipients, &amounts);
    assert_eq!(token_client.balance(&sender), 55);
    assert_eq!(payment.get_payment_count(&sender), 3);
}

#[test]
fn escrow_funding_and_release_are_blocked_without_partial_state_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::random(&env);
    let funder = Address::random(&env);
    let recipient = Address::random(&env);
    let token_id = env.register_stellar_asset_contract(admin.clone());
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);
    let escrow = EscrowContractClient::new(&env, &env.register_contract(None, EscrowContract));
    let pause = pausable(&env, &admin);

    escrow.initialize(&admin, &token_id);
    escrow.set_pausable_contract(&pause.address);
    escrow.create_milestone(&1, &recipient, &100);
    token_admin.mint(&funder, &200);
    escrow.fund_milestone(&1, &funder);
    assert_eq!(token_client.balance(&escrow.address), 100);

    pause.pause();
    assert!(escrow.try_fund_milestone(&1, &funder).is_err());
    assert!(escrow.try_release_milestone(&1, &5_000).is_err());
    assert_eq!(token_client.balance(&funder), 100);
    assert_eq!(token_client.balance(&escrow.address), 100);
    assert_eq!(token_client.balance(&recipient), 0);
    assert_eq!(escrow.get_milestone(&1).released_bps, 0);

    pause.unpause();
    escrow.release_milestone(&1, &5_000);
    assert_eq!(token_client.balance(&recipient), 50);
    assert_eq!(escrow.get_milestone(&1).released_bps, 5_000);
}

#[test]
fn bridge_wrap_and_unwrap_are_blocked_without_balance_changes_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::random(&env);
    let user = Address::random(&env);
    let native_asset = Address::random(&env);
    let bridge = WrappedAssetBridgeContractClient::new(
        &env,
        &env.register_contract(None, WrappedAssetBridgeContract),
    );
    let pause = pausable(&env, &admin);

    bridge.initialize(&admin);
    bridge.set_pausable_contract(&pause.address);
    bridge.wrap(&user, &native_asset, &100);
    assert_eq!(bridge.get_wrapped_balance(&user, &native_asset), 100);

    pause.pause();
    assert!(bridge.try_wrap(&user, &native_asset, &50).is_err());
    assert!(bridge.try_unwrap(&user, &native_asset, &50).is_err());
    assert_eq!(bridge.get_wrapped_balance(&user, &native_asset), 100);

    pause.unpause();
    bridge.unwrap(&user, &native_asset, &50);
    assert_eq!(bridge.get_wrapped_balance(&user, &native_asset), 50);
}
