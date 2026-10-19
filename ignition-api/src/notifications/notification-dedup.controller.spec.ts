import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDedupController } from './notification-dedup.controller';
import { NotificationDedupStore } from './notification-dedup.store';
import { SessionGuard } from '../session/session.guard';
import { AdminGuard } from '../users/guards/admin.guard';

const dedupMock = {
  windowMs: 60 * 60 * 1000,
  entries: jest.fn(),
  clear: jest.fn(),
};

describe('NotificationDedupController (#623)', () => {
  let controller: NotificationDedupController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationDedupController],
      providers: [{ provide: NotificationDedupStore, useValue: dedupMock }],
    })
      // The guards are asserted by metadata below; overriding them keeps this a
      // unit test of the controller rather than of the auth stack.
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(NotificationDedupController);
    jest.clearAllMocks();
  });

  it('is restricted to admins', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      NotificationDedupController,
    ) as unknown[];

    // Deduplication state is operational data; it must not be world-readable.
    expect(guards).toHaveLength(2);
    expect(guards.map((g) => (g as { name: string }).name)).toEqual([
      'SessionGuard',
      'AdminGuard',
    ]);
  });

  describe('view()', () => {
    it('reports the window alongside the live entries', async () => {
      const entries = [{ key: 'notif-dedup:test:aa', value: 'n1', ttlMs: 1000 }];
      dedupMock.entries.mockResolvedValue(entries);

      expect(await controller.view()).toEqual({
        windowMs: 60 * 60 * 1000,
        count: 1,
        entries,
      });
      expect(dedupMock.entries).toHaveBeenCalledWith(100);
    });

    it('accepts a limit and caps it', async () => {
      dedupMock.entries.mockResolvedValue([]);

      await controller.view('25');
      expect(dedupMock.entries).toHaveBeenCalledWith(25);

      await controller.view('100000');
      expect(dedupMock.entries).toHaveBeenCalledWith(1000);
    });

    it('falls back to the default for a nonsense limit', async () => {
      dedupMock.entries.mockResolvedValue([]);

      await controller.view('not-a-number');
      expect(dedupMock.entries).toHaveBeenCalledWith(100);

      await controller.view('-5');
      expect(dedupMock.entries).toHaveBeenCalledWith(100);
    });
  });

  describe('clear()', () => {
    it('reports how many windows were released', async () => {
      dedupMock.clear.mockResolvedValue(7);

      expect(await controller.clear()).toEqual({ cleared: 7 });
    });
  });
});
