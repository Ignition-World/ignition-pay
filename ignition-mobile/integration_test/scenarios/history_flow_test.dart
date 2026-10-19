import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:ignition_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('History flow test: load, filter, search, tap', (WidgetTester tester) async {
    app.main();
    await tester.pumpAndSettle();

    // 1. Navigate to History tab
    final historyTab = find.text('History').last;
    expect(historyTab, findsOneWidget);
    await tester.tap(historyTab);
    await tester.pumpAndSettle();

    // 2. Load: Check if transactions are loaded
    expect(find.byType(ListTile), findsWidgets);
    expect(find.text('In: 5.00 XLM'), findsWidgets);

    // 3. Filter: Tap a filter chip
    final sentChip = find.widgetWithText(ChoiceChip, 'Sent');
    await tester.tap(sentChip);
    await tester.pumpAndSettle();
    
    // Check if filtered by Sent (Out)
    expect(find.text('In: 5.00 XLM'), findsNothing);

    // Filter back to All
    final allChip = find.widgetWithText(ChoiceChip, 'All');
    await tester.tap(allChip);
    await tester.pumpAndSettle();

    // 4. Search: Type in search bar
    final searchBar = find.byType(TextField);
    await tester.enterText(searchBar, 'tx_hash_1');
    await tester.pumpAndSettle(const Duration(seconds: 1)); // wait for debounce/fetch

    // Check if only searched transaction is there
    expect(find.text('tx_hash_1'), findsNothing); // We don't display hash directly, but we can search it
    
    // We expect tx_hash_1 to be 'In: 17.50 USDC'
    expect(find.text('In: 17.50 USDC'), findsWidgets);

    // 5. Tap: Tap on a transaction
    final firstTx = find.byType(ListTile).first;
    await tester.tap(firstTx);
    await tester.pumpAndSettle();

    // Verify tap nav (expected to go to Transaction Detail which shows Transaction: tx_hash_...)
    expect(find.textContaining('Transaction: tx_hash_'), findsOneWidget);
  });
}
