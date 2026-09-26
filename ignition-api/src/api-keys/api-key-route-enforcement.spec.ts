import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyScopeGuard } from './api-key-scope.guard';
import { API_KEY_SCOPE_KEY } from './decorators/require-scope.decorator';
import { PaymentsController } from '../payments/payments.controller';
import { TransactionsController } from '../transactions/transactions.controller';
import { AddressesController } from '../addresses/addresses.controller';
import { CampaignsController } from '../campaigns/campaigns.controller';
import { WalletsController } from '../wallets/wallets.controller';

describe('API key route enforcement', () => {
  const expectRouteEnforcement = (
    controller: new (...args: never[]) => object,
    methodName: string,
    expectedScope: string,
  ) => {
    const target = controller.prototype[methodName];

    expect(Reflect.getMetadata(API_KEY_SCOPE_KEY, target)).toEqual([
      expectedScope,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, target)).toEqual([
      ApiKeyGuard,
      ApiKeyScopeGuard,
    ]);
  };

  it('requires read scope for read-only routes', () => {
    expectRouteEnforcement(TransactionsController, 'getTransactions', 'read');
    expectRouteEnforcement(AddressesController, 'findAll', 'read');
    expectRouteEnforcement(CampaignsController, 'browseCampaigns', 'read');
    expectRouteEnforcement(WalletsController, 'getWallets', 'read');
    expectRouteEnforcement(WalletsController, 'getWallet', 'read');
    expectRouteEnforcement(WalletsController, 'getBalance', 'read');
  });

  it('requires write scope for mutating routes', () => {
    expectRouteEnforcement(PaymentsController, 'create', 'write');
    expectRouteEnforcement(WalletsController, 'createWallet', 'write');
    expectRouteEnforcement(WalletsController, 'deleteWallet', 'write');
    expectRouteEnforcement(WalletsController, 'restoreWallet', 'write');
    expectRouteEnforcement(AddressesController, 'create', 'write');
  });
});
