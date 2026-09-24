import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/core/design_system/app_network_image.dart';
import 'package:ignition_mobile/core/design_system/shimmer_loader.dart';

import '../../helpers/test_app.dart';

void main() {
  group('AppNetworkImage', () {
    testWidgets('builds ClipRRect + CachedNetworkImage shell', (tester) async {
      await tester.pumpWidget(
        testApp(
          const AppNetworkImage(
            url: 'https://example.com/avatar.png',
            width: 80,
            height: 80,
          ),
        ),
      );
      // Do not settle — shimmer placeholder animates continuously.
      await tester.pump();

      expect(find.byType(AppNetworkImage), findsOneWidget);
      expect(find.byType(ClipRRect), findsWidgets);
      expect(find.byType(CachedNetworkImage), findsOneWidget);
    });

    testWidgets('shows ShimmerBox placeholder while loading', (tester) async {
      await tester.pumpWidget(
        testApp(
          const AppNetworkImage(
            url: 'https://example.com/slow.png',
            width: 64,
            height: 64,
            borderRadius: 16,
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(ShimmerBox), findsOneWidget);
    });

    testWidgets('honors custom size and fit in CachedNetworkImage',
        (tester) async {
      await tester.pumpWidget(
        testApp(
          const AppNetworkImage(
            url: 'https://example.com/cover.png',
            width: 120,
            height: 40,
            fit: BoxFit.contain,
            borderRadius: 4,
          ),
        ),
      );
      await tester.pump();

      final image = tester.widget<CachedNetworkImage>(
        find.byType(CachedNetworkImage),
      );
      expect(image.width, 120);
      expect(image.height, 40);
      expect(image.fit, BoxFit.contain);
      expect(image.imageUrl, 'https://example.com/cover.png');

      final clip = tester.widget<ClipRRect>(
        find.descendant(
          of: find.byType(AppNetworkImage),
          matching: find.byType(ClipRRect),
        ).first,
      );
      expect(clip.borderRadius, BorderRadius.circular(4));
    });

    testWidgets('renders under dark theme without throwing', (tester) async {
      await tester.pumpWidget(
        testApp(
          const AppNetworkImage(
            url: 'https://example.com/dark.png',
            width: 48,
            height: 48,
          ),
          themeMode: ThemeMode.dark,
        ),
      );
      await tester.pump();

      expect(find.byType(CachedNetworkImage), findsOneWidget);
    });
  });
}
