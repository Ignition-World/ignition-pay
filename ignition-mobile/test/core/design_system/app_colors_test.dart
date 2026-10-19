import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/core/design_system/app_colors.dart';

void main() {
  group('AppColors', () {
    test('exposes stable brand and semantic color tokens', () {
      expect(AppColors.primary, const Color(0xFF6C63FF));
      expect(AppColors.primaryDark, const Color(0xFF4B44CC));
      expect(AppColors.surface, const Color(0xFFFFFFFF));
      expect(AppColors.surfaceDark, const Color(0xFF1A1A2E));
      expect(AppColors.onSurface, const Color(0xFF1A1A2E));
      expect(AppColors.onSurfaceDark, const Color(0xFFF5F5FF));
      expect(AppColors.muted, const Color(0xFF616161));
      expect(AppColors.success, const Color(0xFF2E7D32));
      expect(AppColors.error, const Color(0xFFD32F2F));
      expect(AppColors.warning, const Color(0xFFF57C00));
    });

    test('light and dark surface pairs remain distinct', () {
      expect(AppColors.surface, isNot(equals(AppColors.surfaceDark)));
      expect(AppColors.onSurface, isNot(equals(AppColors.onSurfaceDark)));
      expect(AppColors.primary, isNot(equals(AppColors.primaryDark)));
    });
  });
}
