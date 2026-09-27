import 'package:flutter/material.dart';

import 'data/fee_estimate.dart';

/// Surfaces the network fee for a pending send so the cost is never
/// hidden from the user before they confirm the transaction.
///
/// Supports loading states, retry on error, fiat equivalents, and
/// comparison with minimum network base fee.
class FeeDisclosure extends StatelessWidget {
  const FeeDisclosure({
    super.key,
    this.feeAmount,
    this.assetCode,
    this.feeEstimate,
    this.isLoading = false,
    this.errorMessage,
    this.onRetry,
    this.showComparison = true,
  }) : assert(
          feeEstimate != null || (feeAmount != null && assetCode != null) || isLoading || errorMessage != null,
          'Either feeEstimate, (feeAmount and assetCode), isLoading, or errorMessage must be provided',
        );

  /// Direct fee amount string (e.g. '0.00001').
  final String? feeAmount;

  /// Direct asset code string (e.g. 'XLM').
  final String? assetCode;

  /// Complete [FeeEstimate] object containing fee, fiat equivalent, and min fee.
  final FeeEstimate? feeEstimate;

  /// Whether fee estimate is currently being fetched.
  final bool isLoading;

  /// Error message if fee estimation failed.
  final String? errorMessage;

  /// Callback when user taps retry on failure.
  final VoidCallback? onRetry;

  /// Whether to show the comparison with the minimum network fee.
  final bool showComparison;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    // Loading State
    if (isLoading) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
        decoration: BoxDecoration(
          color: colors.surfaceContainerHighest.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: colors.primary,
              ),
            ),
            const SizedBox(width: 12),
            Text(
              'Estimating network fee…',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceVariant,
              ),
            ),
          ],
        ),
      );
    }

    // Error State with Retry
    if (errorMessage != null && errorMessage!.isNotEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
        decoration: BoxDecoration(
          color: colors.errorContainer.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(Icons.error_outline, size: 18, color: colors.error),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                errorMessage!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.onErrorContainer,
                ),
              ),
            ),
            if (onRetry != null) ...[
              const SizedBox(width: 8),
              TextButton(
                key: const Key('fee_retry_button'),
                onPressed: onRetry,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Retry'),
              ),
            ],
          ],
        ),
      );
    }

    // Resolved Fee Values
    final estimate = feeEstimate ??
        FeeEstimate(
          feeAmount: feeAmount ?? '0.00001',
          assetCode: assetCode ?? 'XLM',
        );

    final displayAmount = estimate.feeAmount;
    final displayAsset = estimate.assetCode;
    final fiatText = estimate.formattedFiat;
    final minFee = estimate.minimumNetworkFee;
    final hasComparison = showComparison && estimate.hasComparison;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Network fee',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: colors.onSurfaceVariant,
                      ),
                    ),
                    if (hasComparison)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          'Minimum network fee: $minFee $displayAsset',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: colors.onSurfaceVariant.withValues(alpha: 0.8),
                            fontSize: 11,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '$displayAmount $displayAsset',
                      textAlign: TextAlign.end,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (fiatText != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          fiatText,
                          textAlign: TextAlign.end,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: colors.onSurfaceVariant,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
