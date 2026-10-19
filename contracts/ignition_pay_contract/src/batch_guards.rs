//! Batch size validation (CONTRACT-023).

/// Maximum number of payouts accepted by a single `batch_send`. Kept well below
/// the 100-op transaction limit so a batch cannot fail mid-way (leaving a
/// half-paid state) or bloat the ledger.
pub const MAX_BATCH_SIZE: u32 = 50;

/// Call at the top of `PaymentContract::batch_send`, before any transfer:
/// rejects empty, oversized or mismatched (recipients vs amounts) batches so
/// the whole call fails up front instead of partway through.
pub fn validate_batch_size(recipients_len: u32, amounts_len: u32) {
    if recipients_len != amounts_len {
        panic!("recipients and amounts length mismatch");
    }
    if recipients_len == 0 {
        panic!("batch must not be empty");
    }
    if recipients_len > MAX_BATCH_SIZE {
        panic!("batch size exceeds maximum");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_batch_at_limit() {
        validate_batch_size(MAX_BATCH_SIZE, MAX_BATCH_SIZE);
    }

    #[test]
    #[should_panic(expected = "batch size exceeds maximum")]
    fn rejects_batch_over_limit() {
        validate_batch_size(MAX_BATCH_SIZE + 1, MAX_BATCH_SIZE + 1);
    }

    #[test]
    #[should_panic(expected = "batch must not be empty")]
    fn rejects_empty_batch() {
        validate_batch_size(0, 0);
    }

    #[test]
    #[should_panic(expected = "length mismatch")]
    fn rejects_length_mismatch() {
        validate_batch_size(2, 3);
    }
}
