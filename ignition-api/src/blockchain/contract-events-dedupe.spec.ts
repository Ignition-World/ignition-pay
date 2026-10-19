import { ContractEventsProcessor } from './contract-events.processor';
import { CreateAddressDto } from '../addresses/dto/create-address.dto';
import { validate } from 'class-validator';
import { Keypair } from '@stellar/stellar-sdk';

describe('ContractEventsProcessor dedupe', () => {
  it('processes a replayed effect only once', async () => {
    const seen = new Set<string>();
    const redis = {
      get: jest.fn(async () => null),
      set: jest.fn(async (key: string, ...rest: unknown[]) => {
        if (rest.includes('NX')) return seen.has(key) ? null : (seen.add(key), 'OK');
        return 'OK';
      }),
    };
    const processor = new ContractEventsProcessor(redis as never);
    const spy = jest.spyOn(processor as any, 'processEvents').mockResolvedValue(undefined);

    await processor.handleEventBatch({ data: { events: [{ id: 'e1' }, { id: 'e1' }, { id: 'e2' }], ledgerSequence: 5 } } as never);

    expect(spy).toHaveBeenCalledWith([{ id: 'e1' }, { id: 'e2' }]);
  });
});

describe('CreateAddressDto checksum', () => {
  const build = (address: string) => Object.assign(new CreateAddressDto(), { address });

  it('accepts a real address and rejects a mistyped one', async () => {
    const good = Keypair.random().publicKey();
    const typo = good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A');
    expect(await validate(build(good))).toHaveLength(0);
    expect(await validate(build(typo))).not.toHaveLength(0);
  });
});
