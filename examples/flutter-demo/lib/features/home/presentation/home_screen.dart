import 'flutter/material.dart';
import 'package:flutter/services.dart';
import '../../receive/presentation/widgets/receive_panel.dart';
import '../../analyze/presentation/widgets/analyze_panel.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Future<void> _onRefresh() async {
    await Future.delayed(const Duration(seconds: 1));
  }

  Future<void> _pasteFromClipboard(BuildContext context) async {
    final ClipboardData? data = await Clipboard.getData(Clipboard.kTextPlain);
    if (data == null || data.text == null) return;

    final TextFieldState? textFieldState = context.findAncestorStateOfType<TextFieldState>();
    if (textFieldState == null) return;

    final TextEditingController controller = textFieldState.controller;
    final TextEditingValue value = controller.value;
    final String text = data.text!;
    final String newText = value.text.replaceRange(value.selection.start, value.selection.end, text);
    controller.value = value.copyWith(
      text: newText,
      selection: TextSelection.collapsed(offset: newText.length),
    );
  }

  Widget _buildAnalyzePanel(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(
        inputDecorationTheme: InputDecorationTheme(
          suffixIcon: Builder(
            builder: (iconContext) => IconButton(
              icon: const Icon(Icons.content_paste),
              tooltip: 'Paste from clipboard',
              onPressed: () => _pasteFromClipboard(iconContext),
            ),
          ),
        ),
      ),
      child: const AnalyzePanel(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Stellar Address Kit'), centerTitle: true),
      body: LayoutBuilder(
        builder: (context, constraints) {
          if (constraints.maxWidth > 900) {
            return Row(
              children: [
                const Expanded(child: ReceivePanel()),
                const VerticalDivider(width: 1),
                Expanded(child: _buildAnalyzePanel(context)),
              ],
            );
          } else if (constraints.maxWidth > 600) {
            return RefreshIndicator(
              onRefresh: _onRefresh,
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    const ReceivePanel(),
                    const Divider(height: 1),
                    _buildAnalyzePanel(context),
                  ],
                ),
              ),
            );
          } else {
            return DefaultTabController(
              length: 2,
              child: Column(
                children: [
                  const TabBar(
                    tabs: [
                      Tab(text: 'Receive', icon: Icon(Icons.download)),
                      Tab(text: 'Analyze', icon: Icon(Icons.search)),
                    ],
                  ),
                  Expanded(
                    child: TabBarView(
                      children: [
                        RefreshIndicator(
                          onRefresh: _onRefresh,
                          child: const ReceivePanel(),
                        ),
                        RefreshIndicator(
                          onRefresh: _onRefresh,
                          child: _buildAnalyzePanel(context),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }
        },
      ),
    );
  }
}
