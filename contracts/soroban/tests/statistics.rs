use ignition_soroban_statistics::{
    get_statistics, Address, ContractEnv, EventRecord, Symbol,
};

fn event(event_type: &str, submitter: &str, ledger_time: u64) -> EventRecord {
    EventRecord::new(
        Symbol::from(event_type),
        Address::from(submitter),
        ledger_time,
    )
}

#[test]
fn returns_counts_by_type_and_submitter_for_mixed_events() {
    let current_time = 100_000u64;
    let env = ContractEnv {
        current_ledger_time: current_time,
        events: vec![
            event("deposit", "alice", current_time - 60),
            event("deposit", "alice", current_time - 3_600),
            event("withdrawal", "bob", current_time - 3_601),
            event("deposit", "carol", current_time.saturating_sub(86_400)),
            event("routing", "bob", current_time.saturating_sub(86_401)),
        ],
    };

    let stats = get_statistics(&env);

    assert_eq!(stats.total_events, 5);
    assert_eq!(stats.events_last_hour, 2);
    assert_eq!(stats.events_last_day, 4);
    assert_eq!(stats.events_last_week, 5);
    assert_eq!(
        stats.events_by_type,
        vec![
            (Symbol::from("deposit"), 3),
            (Symbol::from("routing"), 1),
            (Symbol::from("withdrawal"), 1),
        ]
    );
    assert_eq!(
        stats.top_submitters,
        vec![
            (Address::from("alice"), 2),
            (Address::from("bob"), 2),
            (Address::from("carol"), 1),
        ]
    );
}

#[test]
fn returns_empty_statistics_for_a_blank_ledger() {
    let env = ContractEnv {
        current_ledger_time: 10_000u64,
        events: vec![],
    };

    let stats = get_statistics(&env);

    assert_eq!(stats.total_events, 0);
    assert!(stats.events_by_type.is_empty());
    assert_eq!(stats.events_last_hour, 0);
    assert_eq!(stats.events_last_day, 0);
    assert_eq!(stats.events_last_week, 0);
    assert!(stats.top_submitters.is_empty());
}
