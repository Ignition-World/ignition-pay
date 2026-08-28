import 'dart:io';
import 'package:stellar/stellar.dart';

void main() async {
  final keypair = Keypair.random();
  print('Public Key: ${keypair.accountId}');
  print('Secret Seed: ${keypair.secretSeed}');

  final server = Server('https://horizon-testnet.stellar.org');
  await FriendBot.fundTestAccount(keypair.accountId);
  print('Account funded on testnet');

  final account = await server.accounts.account(keypair.accountId);
  for (final balance in account.balances) {
    print('Balance: ${balance.assetType} ${balance.balance}');
  }

  print('Enter recipient address:');
  final destination = stdin.readLineSync()!;
  final transaction = TransactionBuilder(account)
    .addOperation(PaymentOperation(
      destination: destination,
      asset: AssetTypeNative(),
      amount: '10.0',
    ))
    .build();

  transaction.sign(keypair);
  final response = await server.submitTransaction(transaction);
  print('Transaction hash: ${response.hash}');
}