use std::collections::BTreeMap;

/// A lightweight address wrapper for event submitters.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Address(String);

impl Address {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for Address {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

/// A lightweight symbol wrapper for event types.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Symbol(String);

impl Symbol {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for Symbol {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

/// A single event record that can be scanned by the contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventRecord {
    pub event_type: Symbol,
    pub submitter: Address,
    pub ledger_time: u64,
}

impl EventRecord {
    pub fn new(event_type: Symbol, submitter: Address, ledger_time: u64) -> Self {
        Self {
            event_type,
            submitter,
            ledger_time,
        }
    }
}

/// Minimal contract environment used for statistics computation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractEnv {
    pub current_ledger_time: u64,
    pub events: Vec<EventRecord>,
}

/// Contract-level statistics for an event ledger.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractStatistics {
    pub total_events: u32,
    pub events_by_type: Vec<(Symbol, u32)>,
    pub events_last_hour: u32,
    pub events_last_day: u32,
    pub events_last_week: u32,
    pub top_submitters: Vec<(Address, u32)>,
}

/// Compute a summary of event activity.
///
/// This performs a full ledger scan, so it should be treated as a gas-expensive
/// read operation for larger ledgers.
pub fn get_statistics(env: &ContractEnv) -> ContractStatistics {
    let mut events_by_type: BTreeMap<String, u32> = BTreeMap::new();
    let mut submitter_counts: BTreeMap<String, u32> = BTreeMap::new();

    let mut last_hour = 0u32;
    let mut last_day = 0u32;
    let mut last_week = 0u32;

    for event in &env.events {
        let event_type_key = event.event_type.as_str().to_string();
        let submitter_key = event.submitter.as_str().to_string();

        *events_by_type.entry(event_type_key).or_insert(0) += 1;
        *submitter_counts.entry(submitter_key).or_insert(0) += 1;

        let age = env.current_ledger_time.saturating_sub(event.ledger_time);
        if age <= 3_600 {
            last_hour += 1;
        }
        if age <= 86_400 {
            last_day += 1;
        }
        if age <= 604_800 {
            last_week += 1;
        }
    }

    let mut events_by_type = events_by_type
        .into_iter()
        .map(|(name, count)| (Symbol(name), count))
        .collect::<Vec<_>>();
    events_by_type.sort_by(|left, right| left.0.cmp(&right.0));

    let mut top_submitters = submitter_counts
        .into_iter()
        .map(|(address, count)| (Address(address), count))
        .collect::<Vec<_>>();
    top_submitters.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));

    ContractStatistics {
        total_events: env.events.len().try_into().unwrap_or(u32::MAX),
        events_by_type,
        events_last_hour: last_hour,
        events_last_day: last_day,
        events_last_week: last_week,
        top_submitters,
    }
}
