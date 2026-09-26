import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';

const allowAllGuard = { canActivate: (_ctx: ExecutionContext) => true };

describe('AddressesController', () => {
  let controller: AddressesController;
  let service: jest.Mocked<
    Pick<
      AddressesService,
      | 'create'
      | 'findAll'
      | 'findOne'
      | 'findByWallet'
      | 'update'
      | 'remove'
      | 'generate'
      | 'listByWallet'
      | 'verifyAddress'
      | 'generateMemo'
      | 'validateMemo'
      | 'resolveDeposit'
    >
  >;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      findByWallet: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      generate: jest.fn(),
      listByWallet: jest.fn(),
      verifyAddress: jest.fn(),
      generateMemo: jest.fn(),
      validateMemo: jest.fn(),
      resolveDeposit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressesController],
      providers: [{ provide: AddressesService, useValue: service }],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(allowAllGuard)
      .overrideGuard(ApiKeyScopeGuard)
      .useValue(allowAllGuard)
      .compile();

    controller = module.get<AddressesController>(AddressesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create() should call addressesService.create', async () => {
    const dto = {
      walletId: 'w-123',
      address: 'G123',
      network: 'STELLAR' as any,
      label: 'test',
    };
    service.create.mockResolvedValue({ id: 'addr-123', ...dto } as any);
    const res = await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ id: 'addr-123', ...dto });
  });

  it('findAll() should call addressesService.findAll', async () => {
    service.findAll.mockResolvedValue([{ id: 'addr-123' }] as any);
    const res = await controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
    expect(res).toEqual([{ id: 'addr-123' }]);
  });

  it('findOne() should call addressesService.findOne', async () => {
    service.findOne.mockResolvedValue({ id: 'addr-123' } as any);
    const res = await controller.findOne('addr-123');
    expect(service.findOne).toHaveBeenCalledWith('addr-123');
    expect(res).toEqual({ id: 'addr-123' });
  });

  it('findByWallet() should call addressesService.findByWallet', async () => {
    service.findByWallet.mockResolvedValue([{ id: 'addr-123' }] as any);
    const res = await controller.findByWallet('w-123');
    expect(service.findByWallet).toHaveBeenCalledWith('w-123');
    expect(res).toEqual([{ id: 'addr-123' }]);
  });

  it('update() should call addressesService.update', async () => {
    const dto = { label: 'new-label' };
    service.update.mockResolvedValue({
      id: 'addr-123',
      label: 'new-label',
    } as any);
    const res = await controller.update('addr-123', dto);
    expect(service.update).toHaveBeenCalledWith('addr-123', dto);
    expect(res).toEqual({ id: 'addr-123', label: 'new-label' });
  });

  it('remove() should call addressesService.remove', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.remove('addr-123');
    expect(service.remove).toHaveBeenCalledWith('addr-123');
  });

  it('generate() should call addressesService.generate', async () => {
    const req = { user: { sub: 'user-123' } };
    const dto = { walletId: 'w-123' };
    service.generate.mockResolvedValue({ address: 'GNEW' } as any);
    const res = await controller.generate(req, dto);
    expect(service.generate).toHaveBeenCalledWith('user-123', dto);
    expect(res).toEqual({ address: 'GNEW' });
  });

  it('listByWallet() should call addressesService.listByWallet', async () => {
    const req = { user: { sub: 'user-123' } };
    service.listByWallet.mockResolvedValue([{ id: 'addr-123' }] as any);
    const res = await controller.listByWallet(req, 'w-123');
    expect(service.listByWallet).toHaveBeenCalledWith('user-123', 'w-123');
    expect(res).toEqual([{ id: 'addr-123' }]);
  });

  describe('verify()', () => {
    const VALID_ADDRESS =
      'GBZXN7PIRZGNMHGA7D3TLXWGABSIJHKRNM5Z7HCFVQ7WFMJDBJJLKGZ';

    it('should return valid: true for a valid Stellar address', () => {
      service.verifyAddress.mockReturnValue({
        valid: true,
        address: VALID_ADDRESS,
      });
      const result = controller.verify({ address: VALID_ADDRESS });
      expect(service.verifyAddress).toHaveBeenCalledWith(VALID_ADDRESS);
      expect(result).toEqual({ valid: true, address: VALID_ADDRESS });
    });

    it('should return valid: false with reason for a non-G prefix address', () => {
      const badAddress =
        'XBZXN7PIRZGNMHGA7D3TLXWGABSIJHKRNM5Z7HCFVQ7WFMJDBJJLKGZ';
      service.verifyAddress.mockReturnValue({
        valid: false,
        address: badAddress,
        reason: 'Address must start with G (Ed25519 public key prefix)',
      });
      const result = controller.verify({ address: badAddress });
      expect(service.verifyAddress).toHaveBeenCalledWith(badAddress);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/must start with G/i);
    });

    it('should return valid: false with reason for a corrupted-checksum address', () => {
      const corrupted = VALID_ADDRESS.slice(0, -1) + 'A';
      service.verifyAddress.mockReturnValue({
        valid: false,
        address: corrupted,
        reason: 'Invalid StrKey checksum or malformed address',
      });
      const result = controller.verify({ address: corrupted });
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/checksum|malformed/i);
    });

    it('should always return HTTP 200 (method returns synchronously, not throwing)', () => {
      service.verifyAddress.mockReturnValue({
        valid: false,
        address: 'BAD',
        reason: 'test',
      });
      // controller.verify is synchronous; if it doesn't throw, NestJS sends 200
      expect(() => controller.verify({ address: 'BAD' })).not.toThrow();
    });
  });

  it('generateMemo() should call addressesService.generateMemo', async () => {
    const req = { user: { sub: 'user-123' } };
    const dto = { walletId: 'w-123', memoType: 'id' as any };
    service.generateMemo.mockResolvedValue({ memoValue: '123' } as any);
    const res = await controller.generateMemo(req, dto);
    expect(service.generateMemo).toHaveBeenCalledWith('user-123', dto);
    expect(res).toEqual({ memoValue: '123' });
  });

  it('validateMemo() should call addressesService.validateMemo', async () => {
    const dto = { memoType: 'text', memoValue: 'note' };
    service.validateMemo.mockResolvedValue({ valid: true } as any);
    const res = await controller.validateMemo(dto);
    expect(service.validateMemo).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ valid: true });
  });

  it('resolveDeposit() should call addressesService.resolveDeposit', async () => {
    const dto = { destination: 'G123', memoType: 'id', memoValue: '123' };
    service.resolveDeposit.mockResolvedValue({ routed: true } as any);
    const res = await controller.resolveDeposit(dto);
    expect(service.resolveDeposit).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ routed: true });
  });
});
