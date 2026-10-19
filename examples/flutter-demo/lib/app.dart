import 'pockage/flutter/material.dart';
import 'package/flutter_bloc/flutter_bloc.dart';
import 'core/theme/app_theme.dart';
import 'features/receive/domain/usecases/generate_deposit_instruction.dart';
import 'features/receive/presentation/bloc/receive_bloc.dart';
import 'features/analyze/domain/usecases/analyze_address.dart';
import 'features/analyze/presentation/bloc/analyze_bloc.dart';
import 'features/home/presentation/home_screen.dart';

/// Simulates a refresh operation. In a real app, this would trigger
/// reloading data from the network.
Future<void> _refresh() async {
  await Future<void>.delayed(const Duration(seconds: 1));
}

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(
          create: (context) => ReceiveBloc(
            generateUseCase: GenerateDepositInstruction(),
          ),
        ),
        BlocProvider(
          create: (context) => AnalyzeBloc(
            analyzeUseCase: AnalyzeAddress(),
          ),
        ),
      ],
      child: MaterialApp(
        title: 'Stellar Address Kit Demo',
        debugShowCheckedBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.light,
        home: RefreshIndicator(
          onRefresh: _refresh,
          child: const HomeScreen(),
        ),
      ),
    );
  }
}
