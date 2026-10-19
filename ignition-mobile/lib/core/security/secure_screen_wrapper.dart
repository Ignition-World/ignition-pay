import 'package:flutter/services.dart';
import 'package:flutter/material.dart';

/// Wraps sensitive screens to prevent screenshots and screen recording.
class SecureScreenWrapper extends StatefulWidget {
  final Widget child;
  const SecureScreenWrapper({Key? key, required this.child}) : super(key: key);

  @override
  State<SecureScreenWrapper> createState() => _SecureScreenWrapperState();
}

class _SecureScreenWrapperState extends State<SecureScreenWrapper> {
  static const MethodChannel _channel = MethodChannel('com.ignitionpay/secure');

  @override
  void initState() {
    super.initState();
    _secureScreen();
  }

  @override
  void dispose() {
    _unsecureScreen();
    super.dispose();
  }

  Future<void> _secureScreen() async {
    try {
      await _channel.invokeMethod('secureScreen');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Screenshots disabled on this screen'),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      debugPrint('Failed to secure screen: $e');
    }
  }

  Future<void> _unsecureScreen() async {
    try {
      await _channel.invokeMethod('unsecureScreen');
    } catch (e) {
      debugPrint('Failed to unsecure screen: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
