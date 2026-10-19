import 'dart:io';
import 'package:stellar/stellar.dart';

Future<bool> checkTrustline(Server server, String accountId, Asset asset) async {
  if (asset is AssetTypeNative) return true;
  final account = await server.accounts.account(accountId);
  return account.balances.any((balance) =>
      balance.assetCode == asset.code && balance.assetIssuer == asset.issuer);
}

void main() async {
  final keypair = Keypair.random();
  print('Public Key: ${keypair.accountId}');
  print('Secret Seed: ${keypair.secretSeed}');

  final server = Server('https://horizon-testnet.stellar.org');
  await Friendot.fundTestAccount(keypair.accountId);
  print('Account funded on testnet');

  final account = await server.accounts.account(keypair.accountId);
  for (final balance in account.balances) {
    print('Balance: ${balance.assetType} ${balance.balance}');
  }

  print('Enter recipient address:');
  final destination = stdin.readLineSync()!;
  final asset = AssetTypeNative();
  final hasTrustline = await checkTrustline(server, destination, asset);
  if (!hasTrustline) {
    print('Recipient does not have a trustline for the asset.');
    return;
  }
  final transaction = TransactionBuilder(account)
    .addOperation(PaymentOperation(
      destination: destination,
      asset: asset,
      amount: '10.0',
    ))
    .build();

  transaction.sign(keypair);
  final response = await server.submitTransaction(transaction);
  print('Transaction hash: ${response.hash}');
}