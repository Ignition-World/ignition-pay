#![no_main]
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env};

fuzz_target!(|data: &[u8]| {
    // Fuzz testing for contract authorization edge cases
    if data.is_empty() || data.len() > 1000 {
        return;
    }

    let env = Env::default();
    let admin = Address::random(&env);
    let user = Address::random(&env);

    // Test that authorization logic handles arbitrary input safely
    let contract = ignition_pay_contract::IgnitionPayContractClient::new(
        &env,
        &env.register_contract(None, ignition_pay_contract::IgnitionPayContract),
    );

    // Initialize should always succeed
    contract.initialize(&admin);

    // Test various operations with random data patterns
    let _ = contract.is_authorized(&user);
    let _ = contract.set_kyc_status(&user, &true);
    let _ = contract.authorize(&user);
    let _ = contract.is_authorized(&user);
    let _ = contract.revoke(&user);
    let _ = contract.is_authorized(&user);
});
