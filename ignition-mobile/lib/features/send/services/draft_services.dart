import '../data/draft_store.dart';
import 'draft_sync_service.dart';

/// Process-wide access to the offline draft store and its sync coordinator.
///
/// Kept intentionally small: [store] is always available, while [syncService]
/// is populated by `main()` once connectivity wiring exists.
class DraftServices {
  DraftServices._();

  /// Shared, file-backed draft store.
  static final DraftStore store = DraftStore();

  /// Connectivity-driven auto-submitter, started from `main()`.
  static DraftSyncService? syncService;
}
