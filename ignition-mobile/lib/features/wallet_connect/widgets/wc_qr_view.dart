import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/design_system/app_button.dart';
import '../../../core/design_system/app_colors.dart';
import '../../../core/haptic_service.dart';
import '../services/wallet_connect_service.dart';

/// Displays a WalletConnect pairing URI as a QR code placeholder alongside
/// a copy-to-clipboard action. The QR icon is rendered via a stable,
/// package-free Material icon so the page works without `qr_flutter` — a
/// production build should swap this widget for a real QR renderer.
class WcQrView extends StatefulWidget {
  const WcQrView({
    super.key,
    this.service,
    this.hapticService,
    this.onPairingCreated,
  });

  final WalletConnectService? service;
  final HapticService? hapticService;
  final void Function(PairingData pairing)? onPairingCreated;

  @override
  State<WcQrView> createState() => _WcQrViewState();
}

class _WcQrViewState extends State<WcQrView> {
  late final WalletConnectService _service =
      widget.service ?? WalletConnectService.instance;
  late final HapticService _haptic =
      widget.hapticService ?? HapticService.instance;

  bool _loading = false;
  Object? _error;

  @override
  void dispose() {
    // Do NOT dispose the service here — it is app-scoped.
    super.dispose();
  }

  Future<void> _generate() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await _service.initialize();
      final pairing = await _service.createPairing();
      widget.onPairingCreated?.call(pairing);
      _haptic.lightImpact();
    } catch (e) {
      if (mounted) {
        setState(() => _error = e);
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _copy(String uri) async {
    await Clipboard.setData(ClipboardData(text: uri));
    _haptic.lightImpact();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pairing URI copied')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<PairingData?>(
      valueListenable: _service.currentPairing,
      builder: (context, pairing, _) {
        final hasPairing = pairing != null && !pairing.expiresAt.isBefore(DateTime.now());
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: hasPairing
                  ? _QrBody(
                      pairing: pairing!,
                      onCopy: () => _copy(pairing.uri),
                    )
                  : _Placeholder(
                      loading: _loading,
                      error: _error,
                      onGenerate: _loading ? null : _generate,
                    ),
            ),
            const SizedBox(height: 12),
            AppButton(
              label: hasPairing ? 'Generate new code' : 'Generate connection code',
              onPressed: _loading ? null : _generate,
              variant: hasPairing
                  ? AppButtonVariant.secondary
                  : AppButtonVariant.primary,
              loading: _loading,
              icon: const Icon(Icons.qr_code, size: 18),
            ),
          ],
        );
      },
    );
  }
}

class _QrBody extends StatefulWidget {
  const _QrBody({required this.pairing, required this.onCopy});

  final PairingData pairing;
  final VoidCallback onCopy;

  @override
  State<_QrBody> createState() => _QrBodyState();
}

class _QrBodyState extends State<_QrBody> {
  late Timer _ttl;
  Duration _remaining = Duration.zero;

  @override
  void initState() {
    super.initState();
    _remaining = widget.pairing.expiresAt.difference(DateTime.now());
    _ttl = Timer.periodic(const Duration(seconds: 1), (_) {
      final remaining = widget.pairing.expiresAt.difference(DateTime.now());
      if (remaining.isNegative) {
        _ttl.cancel();
        return;
      }
      if (mounted) setState(() => _remaining = remaining);
    });
  }

  @override
  void dispose() {
    _ttl.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Semantics(
          image: true,
          label: 'WalletConnect QR code',
          child: Container(
            width: 200,
            height: 200,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            child: CustomPaint(
              painter: _PlaceholderQrPainter(theme.colorScheme.onSurface),
              child: Center(
                child: Icon(
                  Icons.qr_code_2,
                  size: 96,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.85),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Scan this code in your DApp',
          style: theme.textTheme.titleMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Text(
          'Expires in ${_formatDuration(_remaining)}',
          style: theme.textTheme.bodySmall?.copyWith(
            color: _remaining.inMinutes < 1 ? theme.colorScheme.error : AppColors.muted,
          ),
        ),
        const SizedBox(height: 12),
        InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: widget.onCopy,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.pairing.uri,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.copy, size: 16, color: theme.colorScheme.primary),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({
    required this.loading,
    required this.error,
    required this.onGenerate,
  });

  final bool loading;
  final Object? error;
  final VoidCallback? onGenerate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Container(
          width: 200,
          height: 200,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: Center(
            child: loading
                ? const CircularProgressIndicator()
                : Icon(
                    Icons.wallet_rounded,
                    size: 72,
                    color: theme.colorScheme.primary.withValues(alpha: 0.6),
                  ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Connect a DApp',
          style: theme.textTheme.titleMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Text(
            error != null
                ? 'Could not generate pairing. Tap "Generate" to retry.'
                : 'Generate a code and scan it from the DApp to connect.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: error != null ? theme.colorScheme.error : AppColors.muted,
            ),
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }
}

class _PlaceholderQrPainter extends CustomPainter {
  _PlaceholderQrPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color.withValues(alpha: 0.08);
    const cell = 14.0;
    final cols = (size.width / cell).floor();
    final rows = (size.height / cell).floor();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        // Deterministic pattern based on position so the placeholder looks
        // like a real QR without needing a full encoder.
        final h = (r * 31 + c * 17 + 7) % 11;
        if (h < 5) {
          canvas.drawRect(
            Rect.fromLTWH(c * cell, r * cell, cell - 0.5, cell - 0.5),
            paint,
          );
        }
      }
    }
    // Finder patterns in the three corners.
    final finder = Paint()..color = color.withValues(alpha: 0.2);
    for (final corner in const [
      Offset(0, 0),
      Offset(1, 0),
      Offset(0, 1),
    ]) {
      final left = corner.dx == 0 ? 0.0 : size.width - cell * 4;
      final top = corner.dy == 0 ? 0.0 : size.height - cell * 4;
      canvas
        ..drawRect(Rect.fromLTWH(left, top, cell * 4, cell * 4), finder)
        ..drawRect(
          Rect.fromLTWH(left + cell, top + cell, cell * 2, cell * 2),
          Paint()..color = color.withValues(alpha: 0.0),
        )
        ..drawRect(
          Rect.fromLTWH(left + cell * 1.5, top + cell * 1.5, cell, cell),
          Paint()..color = color.withValues(alpha: 0.4),
        );
    }
  }

  @override
  bool shouldRepaint(covariant _PlaceholderQrPainter oldDelegate) =>
      color != oldDelegate.color;
}

String _formatDuration(Duration d) {
  if (d.isNegative) return 'expired';
  if (d.inMinutes >= 1) {
    final m = d.inMinutes;
    final s = d.inSeconds.remainder(60);
    return '${m}m ${s.toString().padLeft(2, '0')}s';
  }
  return '${d.inSeconds}s';
}
