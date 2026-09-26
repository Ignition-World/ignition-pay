import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';
import { GovernanceService } from './governance.service';
import { Proposal, ProposalStatus } from './entities/proposal.entity';
import { Vote, VoteChoice } from './entities/vote.entity';
import { User } from '../users/entities/user.entity';
import { CreateProposalDto } from './dto/create-proposal.dto';

describe('GovernanceService (Proposal Lifecycle + Quorum)', () => {
  let service: GovernanceService;

  const mockProposalRepo = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
  };

  const mockVoteRepo = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
  };

  const mockUserRepo = {
    count: vi.fn(),
  };

  const NOW = new Date('2026-08-01T12:00:00Z');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    mockProposalRepo.create.mockReset();
    mockProposalRepo.save.mockReset();
    mockProposalRepo.findOne.mockReset();
    mockProposalRepo.find.mockReset();
    mockVoteRepo.create.mockReset();
    mockVoteRepo.save.mockReset();
    mockVoteRepo.findOne.mockReset();
    mockUserRepo.count.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GovernanceService,
        { provide: getRepositoryToken(Proposal), useValue: mockProposalRepo },
        { provide: getRepositoryToken(Vote), useValue: mockVoteRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<GovernanceService>(GovernanceService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
    return {
      id: 'proposal-1',
      title: 'Add USDC support',
      description: 'Proposal description',
      status: ProposalStatus.ACTIVE,
      votingStartsAt: new Date('2026-08-01T00:00:00Z'),
      votingEndsAt: new Date('2026-08-10T00:00:00Z'),
      quorumThresholdPercent: 50,
      eligibleVoters: 100,
      yesVotes: 0,
      noVotes: 0,
      abstainVotes: 0,
      tallyExecutedAt: null,
      executedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    } as Proposal;
  }

  function validDto(overrides: Partial<CreateProposalDto> = {}): CreateProposalDto {
    return {
      title: 'Add USDC support',
      description: 'Proposal description',
      votingStartsAt: '2026-08-05T00:00:00Z',
      votingEndsAt: '2026-08-20T00:00:00Z',
      quorumThresholdPercent: 50,
      ...overrides,
    };
  }

  describe('createProposal (#505 lifecycle: draft state)', () => {
    it('creates a proposal in draft state and snapshots eligible voters', async () => {
      mockUserRepo.count.mockResolvedValue(42);
      mockProposalRepo.create.mockImplementation((input) => input);
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.createProposal(validDto());

      expect(result.status).toBe(ProposalStatus.DRAFT);
      expect(result.eligibleVoters).toBe(42);
      expect(mockUserRepo.count).toHaveBeenCalled();
    });

    it('rejects a voting window that ends before it starts', async () => {
      mockUserRepo.count.mockResolvedValue(42);
      await expect(
        service.createProposal(
          validDto({
            votingStartsAt: '2026-08-20T00:00:00Z',
            votingEndsAt: '2026-08-05T00:00:00Z',
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a voting window that starts in the past', async () => {
      mockUserRepo.count.mockResolvedValue(42);
      await expect(
        service.createProposal(
          validDto({ votingStartsAt: '2026-07-01T00:00:00Z' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('activateProposal (#505 time-bound lifecycle)', () => {
    it('activates a draft proposal once its window has opened', async () => {
      const proposal = makeProposal({ status: ProposalStatus.DRAFT });
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.activateProposal('proposal-1');

      expect(result.status).toBe(ProposalStatus.ACTIVE);
    });

    it('rejects activation before the voting window opens', async () => {
      const proposal = makeProposal({
        status: ProposalStatus.DRAFT,
        votingStartsAt: new Date('2026-09-01T00:00:00Z'),
      });
      mockProposalRepo.findOne.mockResolvedValue(proposal);

      await expect(service.activateProposal('proposal-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects activating a proposal that is not in draft state', async () => {
      mockProposalRepo.findOne.mockResolvedValue(
        makeProposal({ status: ProposalStatus.REJECTED }),
      );

      await expect(service.activateProposal('proposal-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('castVote (#505 time-bound voting windows)', () => {
    it('accepts a vote while the proposal is active and within the window', async () => {
      const proposal = makeProposal();
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockVoteRepo.findOne.mockResolvedValue(null);
      mockVoteRepo.create.mockImplementation((input) => input);
      mockVoteRepo.save.mockResolvedValue({ id: 'vote-1' });
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.castVote('proposal-1', {
        voterId: 'voter-1',
        choice: VoteChoice.YES,
      });

      expect(result.yesVotes).toBe(1);
      expect(mockVoteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: 'proposal-1',
          voterId: 'voter-1',
          choice: VoteChoice.YES,
          weight: 1,
        }),
      );
    });

    it('rejects votes when the proposal is not active', async () => {
      mockProposalRepo.findOne.mockResolvedValue(
        makeProposal({ status: ProposalStatus.DRAFT }),
      );

      await expect(
        service.castVote('proposal-1', {
          voterId: 'voter-1',
          choice: VoteChoice.YES,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects votes after the voting window has closed', async () => {
      mockProposalRepo.findOne.mockResolvedValue(
        makeProposal({
          votingEndsAt: new Date('2026-07-31T00:00:00Z'),
        }),
      );

      await expect(
        service.castVote('proposal-1', {
          voterId: 'voter-1',
          choice: VoteChoice.YES,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate votes from the same voter', async () => {
      mockProposalRepo.findOne.mockResolvedValue(makeProposal());
      mockVoteRepo.findOne.mockResolvedValue({ id: 'vote-1' });

      await expect(
        service.castVote('proposal-1', {
          voterId: 'voter-1',
          choice: VoteChoice.NO,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('applies vote weight to the tally', async () => {
      const proposal = makeProposal();
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockVoteRepo.findOne.mockResolvedValue(null);
      mockVoteRepo.create.mockImplementation((input) => input);
      mockVoteRepo.save.mockResolvedValue({ id: 'vote-1' });
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.castVote('proposal-1', {
        voterId: 'voter-1',
        choice: VoteChoice.NO,
        weight: 5,
      });

      expect(result.noVotes).toBe(5);
    });
  });

  describe('tallyAndClose (#506 quorum enforcement)', () => {
    // Voting window must have closed by the frozen "now" (2026-08-01).
    const EXPIRED = { votingEndsAt: new Date('2026-07-31T00:00:00Z') };

    it('rejects a proposal when quorum is not met', async () => {
      // 30 votes of 100 eligible = 30% participation, below the 50% quorum.
      const proposal = makeProposal({ ...EXPIRED, yesVotes: 20, noVotes: 10, abstainVotes: 0 });
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.tallyAndClose('proposal-1');

      expect(result.status).toBe(ProposalStatus.REJECTED);
      expect(result.tallyExecutedAt).toBeInstanceOf(Date);
    });

    it('passes a proposal when quorum is met and yes votes win', async () => {
      // 70 votes of 100 eligible = 70% participation, above 50% quorum.
      const proposal = makeProposal({ ...EXPIRED, yesVotes: 45, noVotes: 25, abstainVotes: 0 });
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.tallyAndClose('proposal-1');

      expect(result.status).toBe(ProposalStatus.PASSED);
    });

    it('rejects a proposal when quorum is met but yes votes do not win', async () => {
      const proposal = makeProposal({ ...EXPIRED, yesVotes: 30, noVotes: 40, abstainVotes: 0 });
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.tallyAndClose('proposal-1');

      expect(result.status).toBe(ProposalStatus.REJECTED);
    });

    it('rejects a tie as not passed', async () => {
      const proposal = makeProposal({ ...EXPIRED, yesVotes: 40, noVotes: 40, abstainVotes: 0 });
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.tallyAndClose('proposal-1');

      expect(result.status).toBe(ProposalStatus.REJECTED);
    });

    it('counts abstentions toward quorum participation', async () => {
      // 40 yes + 15 abstain = 55% participation, above 50% quorum.
      const proposal = makeProposal({ ...EXPIRED, yesVotes: 40, noVotes: 0, abstainVotes: 15 });
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.tallyAndClose('proposal-1');

      expect(result.status).toBe(ProposalStatus.PASSED);
    });

    it('refuses to tally before the voting window has closed', async () => {
      mockProposalRepo.findOne.mockResolvedValue(
        makeProposal({
          votingEndsAt: new Date('2026-09-01T00:00:00Z'),
        }),
      );

      await expect(service.tallyAndClose('proposal-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to tally a proposal that is not active', async () => {
      mockProposalRepo.findOne.mockResolvedValue(
        makeProposal({ status: ProposalStatus.PASSED }),
      );

      await expect(service.tallyAndClose('proposal-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('executeProposal (#506 execution gating)', () => {
    it('executes a passed proposal', async () => {
      const proposal = makeProposal({ status: ProposalStatus.PASSED });
      mockProposalRepo.findOne.mockResolvedValue(proposal);
      mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.executeProposal('proposal-1');

      expect(result.status).toBe(ProposalStatus.EXECUTED);
      expect(result.executedAt).toBeInstanceOf(Date);
    });

    it('refuses to execute a proposal that did not pass', async () => {
      mockProposalRepo.findOne.mockResolvedValue(
        makeProposal({ status: ProposalStatus.REJECTED }),
      );

      await expect(service.executeProposal('proposal-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to execute a draft or active proposal', async () => {
      mockProposalRepo.findOne.mockResolvedValue(makeProposal());
      await expect(service.executeProposal('proposal-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getResults (#506 quorum status)', () => {
    it('reports participation and quorum status', async () => {
      const proposal = makeProposal({ yesVotes: 40, noVotes: 10, abstainVotes: 0 });
      mockProposalRepo.findOne.mockResolvedValue(proposal);

      const results = await service.getResults('proposal-1');

      expect(results.totalVotes).toBe(50);
      expect(results.participationPercent).toBe(50);
      expect(results.quorumMet).toBe(true);
      expect(results.requiredVotes).toBe(50);
    });

    it('reports quorum not met when participation is below threshold', async () => {
      const proposal = makeProposal({ yesVotes: 10, noVotes: 0, abstainVotes: 0 });
      mockProposalRepo.findOne.mockResolvedValue(proposal);

      const results = await service.getResults('proposal-1');

      expect(results.quorumMet).toBe(false);
      expect(results.participationPercent).toBe(10);
    });
  });

  describe('getProposal / listProposals', () => {
    it('throws NotFoundException for missing proposal', async () => {
      mockProposalRepo.findOne.mockResolvedValue(null);

      await expect(service.getProposal('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('filters proposals by status', async () => {
      mockProposalRepo.find.mockResolvedValue([]);

      await service.listProposals(ProposalStatus.ACTIVE);

      expect(mockProposalRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: ProposalStatus.ACTIVE } }),
      );
    });
  });
});
