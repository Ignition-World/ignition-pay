import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { ProposalLifecycleService } from './proposal-lifecycle.service';
import { Proposal, ProposalStatus } from '../entities/proposal.entity';

describe('ProposalLifecycleService (auto lifecycle advancement)', () => {
  let service: ProposalLifecycleService;

  const mockProposalRepo = {
    find: vi.fn(),
    save: vi.fn(),
  };

  beforeEach(async () => {
    mockProposalRepo.find.mockReset();
    mockProposalRepo.save.mockReset();
    mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProposalLifecycleService,
        { provide: getRepositoryToken(Proposal), useValue: mockProposalRepo },
      ],
    }).compile();

    service = module.get<ProposalLifecycleService>(ProposalLifecycleService);
  });

  it('activates due drafts and closes expired active proposals', async () => {
    const now = new Date('2026-08-01T12:00:00Z');

    mockProposalRepo.find.mockImplementation((opts) => {
      const { where } = opts;
      if (where.status === ProposalStatus.DRAFT) {
        return Promise.resolve([
          { id: 'p1', status: ProposalStatus.DRAFT, votingStartsAt: now },
        ]);
      }
      // expired active proposals
      return Promise.resolve([
        {
          id: 'p2',
          status: ProposalStatus.ACTIVE,
          votingEndsAt: now,
          eligibleVoters: 100,
          quorumThresholdPercent: 50,
          yesVotes: 60,
          noVotes: 10,
          abstainVotes: 5,
        },
        {
          id: 'p3',
          status: ProposalStatus.ACTIVE,
          votingEndsAt: now,
          eligibleVoters: 100,
          quorumThresholdPercent: 50,
          yesVotes: 10,
          noVotes: 20,
          abstainVotes: 0,
        },
      ]);
    });

    const result = await service.processLifecycle();

    expect(result.activated).toBe(1);
    expect(result.closed).toBe(2);
    expect(mockProposalRepo.save).toHaveBeenCalledTimes(3);

    const saved = mockProposalRepo.save.mock.calls.map(([p]) => p);
    const p2 = saved.find((p: Proposal) => p.id === 'p2');
    const p3 = saved.find((p: Proposal) => p.id === 'p3');

    expect(p2.status).toBe(ProposalStatus.PASSED); // quorum met, yes wins
    expect(p3.status).toBe(ProposalStatus.REJECTED); // no wins
    expect(p3.tallyExecutedAt).toBeInstanceOf(Date);
  });

  it('rejects active proposals that fail quorum', async () => {
    mockProposalRepo.find.mockImplementation((opts) => {
      const { where } = opts;
      if (where.status === ProposalStatus.DRAFT) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: 'p4',
          status: ProposalStatus.ACTIVE,
          votingEndsAt: new Date(),
          eligibleVoters: 100,
          quorumThresholdPercent: 50,
          yesVotes: 20,
          noVotes: 5,
          abstainVotes: 0,
        },
      ]);
    });

    const result = await service.processLifecycle();

    expect(result.closed).toBe(1);
    const saved = mockProposalRepo.save.mock.calls.map(([p]) => p);
    expect(saved[0].status).toBe(ProposalStatus.REJECTED); // 25% < 50% quorum
  });
});
