"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("@nestjs/typeorm");
const common_1 = require("@nestjs/common");
const vitest_1 = require("vitest");
const governance_service_1 = require("./governance.service");
const proposal_entity_1 = require("./entities/proposal.entity");
const vote_entity_1 = require("./entities/vote.entity");
const user_entity_1 = require("../users/entities/user.entity");
(0, vitest_1.describe)('GovernanceService (Proposal Lifecycle + Quorum)', () => {
    let service;
    const mockProposalRepo = {
        create: vitest_1.vi.fn(),
        save: vitest_1.vi.fn(),
        findOne: vitest_1.vi.fn(),
        find: vitest_1.vi.fn(),
    };
    const mockVoteRepo = {
        create: vitest_1.vi.fn(),
        save: vitest_1.vi.fn(),
        findOne: vitest_1.vi.fn(),
    };
    const mockUserRepo = {
        count: vitest_1.vi.fn(),
    };
    const NOW = new Date('2026-08-01T12:00:00Z');
    (0, vitest_1.beforeEach)(async () => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(NOW);
        mockProposalRepo.create.mockReset();
        mockProposalRepo.save.mockReset();
        mockProposalRepo.findOne.mockReset();
        mockProposalRepo.find.mockReset();
        mockVoteRepo.create.mockReset();
        mockVoteRepo.save.mockReset();
        mockVoteRepo.findOne.mockReset();
        mockUserRepo.count.mockReset();
        const module = await testing_1.Test.createTestingModule({
            providers: [
                governance_service_1.GovernanceService,
                { provide: (0, typeorm_1.getRepositoryToken)(proposal_entity_1.Proposal), useValue: mockProposalRepo },
                { provide: (0, typeorm_1.getRepositoryToken)(vote_entity_1.Vote), useValue: mockVoteRepo },
                { provide: (0, typeorm_1.getRepositoryToken)(user_entity_1.User), useValue: mockUserRepo },
            ],
        }).compile();
        service = module.get(governance_service_1.GovernanceService);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    function makeProposal(overrides = {}) {
        return {
            id: 'proposal-1',
            title: 'Add USDC support',
            description: 'Proposal description',
            status: proposal_entity_1.ProposalStatus.ACTIVE,
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
        };
    }
    function validDto(overrides = {}) {
        return {
            title: 'Add USDC support',
            description: 'Proposal description',
            votingStartsAt: '2026-08-05T00:00:00Z',
            votingEndsAt: '2026-08-20T00:00:00Z',
            quorumThresholdPercent: 50,
            ...overrides,
        };
    }
    (0, vitest_1.describe)('createProposal (#505 lifecycle: draft state)', () => {
        (0, vitest_1.it)('creates a proposal in draft state and snapshots eligible voters', async () => {
            mockUserRepo.count.mockResolvedValue(42);
            mockProposalRepo.create.mockImplementation((input) => input);
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.createProposal(validDto());
            (0, vitest_1.expect)(result.status).toBe(proposal_entity_1.ProposalStatus.DRAFT);
            (0, vitest_1.expect)(result.eligibleVoters).toBe(42);
            (0, vitest_1.expect)(mockUserRepo.count).toHaveBeenCalled();
        });
        (0, vitest_1.it)('rejects a voting window that ends before it starts', async () => {
            mockUserRepo.count.mockResolvedValue(42);
            await (0, vitest_1.expect)(service.createProposal(validDto({
                votingStartsAt: '2026-08-20T00:00:00Z',
                votingEndsAt: '2026-08-05T00:00:00Z',
            }))).rejects.toThrow(common_1.BadRequestException);
        });
        (0, vitest_1.it)('rejects a voting window that starts in the past', async () => {
            mockUserRepo.count.mockResolvedValue(42);
            await (0, vitest_1.expect)(service.createProposal(validDto({ votingStartsAt: '2026-07-01T00:00:00Z' }))).rejects.toThrow(common_1.BadRequestException);
        });
    });
    (0, vitest_1.describe)('activateProposal (#505 time-bound lifecycle)', () => {
        (0, vitest_1.it)('activates a draft proposal once its window has opened', async () => {
            const proposal = makeProposal({ status: proposal_entity_1.ProposalStatus.DRAFT });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.activateProposal('proposal-1');
            (0, vitest_1.expect)(result.status).toBe(proposal_entity_1.ProposalStatus.ACTIVE);
        });
        (0, vitest_1.it)('rejects activation before the voting window opens', async () => {
            const proposal = makeProposal({
                status: proposal_entity_1.ProposalStatus.DRAFT,
                votingStartsAt: new Date('2026-09-01T00:00:00Z'),
            });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            await (0, vitest_1.expect)(service.activateProposal('proposal-1')).rejects.toThrow(common_1.BadRequestException);
        });
        (0, vitest_1.it)('rejects activating a proposal that is not in draft state', async () => {
            mockProposalRepo.findOne.mockResolvedValue(makeProposal({ status: proposal_entity_1.ProposalStatus.REJECTED }));
            await (0, vitest_1.expect)(service.activateProposal('proposal-1')).rejects.toThrow(common_1.ConflictException);
        });
    });
    (0, vitest_1.describe)('castVote (#505 time-bound voting windows)', () => {
        (0, vitest_1.it)('accepts a vote while the proposal is active and within the window', async () => {
            const proposal = makeProposal();
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            mockVoteRepo.findOne.mockResolvedValue(null);
            mockVoteRepo.create.mockImplementation((input) => input);
            mockVoteRepo.save.mockResolvedValue({ id: 'vote-1' });
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.castVote('proposal-1', {
                voterId: 'voter-1',
                choice: vote_entity_1.VoteChoice.YES,
            });
            (0, vitest_1.expect)(result.yesVotes).toBe(1);
            (0, vitest_1.expect)(mockVoteRepo.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                proposalId: 'proposal-1',
                voterId: 'voter-1',
                choice: vote_entity_1.VoteChoice.YES,
                weight: 1,
            }));
        });
        (0, vitest_1.it)('rejects votes when the proposal is not active', async () => {
            mockProposalRepo.findOne.mockResolvedValue(makeProposal({ status: proposal_entity_1.ProposalStatus.DRAFT }));
            await (0, vitest_1.expect)(service.castVote('proposal-1', {
                voterId: 'voter-1',
                choice: vote_entity_1.VoteChoice.YES,
            })).rejects.toThrow(common_1.ConflictException);
        });
        (0, vitest_1.it)('rejects votes after the voting window has closed', async () => {
            mockProposalRepo.findOne.mockResolvedValue(makeProposal({
                votingEndsAt: new Date('2026-07-31T00:00:00Z'),
            }));
            await (0, vitest_1.expect)(service.castVote('proposal-1', {
                voterId: 'voter-1',
                choice: vote_entity_1.VoteChoice.YES,
            })).rejects.toThrow(common_1.BadRequestException);
        });
        (0, vitest_1.it)('rejects duplicate votes from the same voter', async () => {
            mockProposalRepo.findOne.mockResolvedValue(makeProposal());
            mockVoteRepo.findOne.mockResolvedValue({ id: 'vote-1' });
            await (0, vitest_1.expect)(service.castVote('proposal-1', {
                voterId: 'voter-1',
                choice: vote_entity_1.VoteChoice.NO,
            })).rejects.toThrow(common_1.ConflictException);
        });
        (0, vitest_1.it)('applies vote weight to the tally', async () => {
            const proposal = makeProposal();
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            mockVoteRepo.findOne.mockResolvedValue(null);
            mockVoteRepo.create.mockImplementation((input) => input);
            mockVoteRepo.save.mockResolvedValue({ id: 'vote-1' });
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.castVote('proposal-1', {
                voterId: 'voter-1',
                choice: vote_entity_1.VoteChoice.NO,
                weight: 5,
            });
            (0, vitest_1.expect)(result.noVotes).toBe(5);
        });
    });
    (0, vitest_1.describe)('tallyAndClose (#506 quorum enforcement)', () => {
        // Voting window must have closed by the frozen "now" (2026-08-01).
        const EXPIRED = { votingEndsAt: new Date('2026-07-31T00:00:00Z') };
        (0, vitest_1.it)('rejects a proposal when quorum is not met', async () => {
            // 30 votes of 100 eligible = 30% participation, below the 50% quorum.
            const proposal = makeProposal({ ...EXPIRED, yesVotes: 20, noVotes: 10, abstainVotes: 0 });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.tallyAndClose('proposal-1');
            (0, vitest_1.expect)(result.status).toBe(proposal_entity_1.ProposalStatus.REJECTED);
            (0, vitest_1.expect)(result.tallyExecutedAt).toBeInstanceOf(Date);
        });
        (0, vitest_1.it)('passes a proposal when quorum is met and yes votes win', async () => {
            // 70 votes of 100 eligible = 70% participation, above 50% quorum.
            const proposal = makeProposal({ ...EXPIRED, yesVotes: 45, noVotes: 25, abstainVotes: 0 });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.tallyAndClose('proposal-1');
            (0, vitest_1.expect)(result.status).toBe(proposal_entity_1.ProposalStatus.PASSED);
        });
        (0, vitest_1.it)('rejects a proposal when quorum is met but yes votes do not win', async () => {
            const proposal = makeProposal({ ...EXPIRED, yesVotes: 30, noVotes: 40, abstainVotes: 0 });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.tallyAndClose('proposal-1');
            (0, vitest_1.expect)(result.status).toBe(proposal_entity_1.ProposalStatus.REJECTED);
        });
        (0, vitest_1.it)('rejects a tie as not passed', async () => {
            const proposal = makeProposal({ ...EXPIRED, yesVotes: 40, noVotes: 40, abstainVotes: 0 });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.tallyAndClose('proposal-1');
            (0, vitest_1.expect)(result.status).toBe(proposal_entity_1.ProposalStatus.REJECTED);
        });
        (0, vitest_1.it)('counts abstentions toward quorum participation', async () => {
            // 40 yes + 15 abstain = 55% participation, above 50% quorum.
            const proposal = makeProposal({ ...EXPIRED, yesVotes: 40, noVotes: 0, abstainVotes: 15 });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.tallyAndClose('proposal-1');
            (0, vitest_1.expect)(result.status).toBe(proposal_entity_1.ProposalStatus.PASSED);
        });
        (0, vitest_1.it)('refuses to tally before the voting window has closed', async () => {
            mockProposalRepo.findOne.mockResolvedValue(makeProposal({
                votingEndsAt: new Date('2026-09-01T00:00:00Z'),
            }));
            await (0, vitest_1.expect)(service.tallyAndClose('proposal-1')).rejects.toThrow(common_1.BadRequestException);
        });
        (0, vitest_1.it)('refuses to tally a proposal that is not active', async () => {
            mockProposalRepo.findOne.mockResolvedValue(makeProposal({ status: proposal_entity_1.ProposalStatus.PASSED }));
            await (0, vitest_1.expect)(service.tallyAndClose('proposal-1')).rejects.toThrow(common_1.ConflictException);
        });
    });
    (0, vitest_1.describe)('executeProposal (#506 execution gating)', () => {
        (0, vitest_1.it)('executes a passed proposal', async () => {
            const proposal = makeProposal({ status: proposal_entity_1.ProposalStatus.PASSED });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
            const result = await service.executeProposal('proposal-1');
            (0, vitest_1.expect)(result.status).toBe(proposal_entity_1.ProposalStatus.EXECUTED);
            (0, vitest_1.expect)(result.executedAt).toBeInstanceOf(Date);
        });
        (0, vitest_1.it)('refuses to execute a proposal that did not pass', async () => {
            mockProposalRepo.findOne.mockResolvedValue(makeProposal({ status: proposal_entity_1.ProposalStatus.REJECTED }));
            await (0, vitest_1.expect)(service.executeProposal('proposal-1')).rejects.toThrow(common_1.ConflictException);
        });
        (0, vitest_1.it)('refuses to execute a draft or active proposal', async () => {
            mockProposalRepo.findOne.mockResolvedValue(makeProposal());
            await (0, vitest_1.expect)(service.executeProposal('proposal-1')).rejects.toThrow(common_1.ConflictException);
        });
    });
    (0, vitest_1.describe)('getResults (#506 quorum status)', () => {
        (0, vitest_1.it)('reports participation and quorum status', async () => {
            const proposal = makeProposal({ yesVotes: 40, noVotes: 10, abstainVotes: 0 });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            const results = await service.getResults('proposal-1');
            (0, vitest_1.expect)(results.totalVotes).toBe(50);
            (0, vitest_1.expect)(results.participationPercent).toBe(50);
            (0, vitest_1.expect)(results.quorumMet).toBe(true);
            (0, vitest_1.expect)(results.requiredVotes).toBe(50);
        });
        (0, vitest_1.it)('reports quorum not met when participation is below threshold', async () => {
            const proposal = makeProposal({ yesVotes: 10, noVotes: 0, abstainVotes: 0 });
            mockProposalRepo.findOne.mockResolvedValue(proposal);
            const results = await service.getResults('proposal-1');
            (0, vitest_1.expect)(results.quorumMet).toBe(false);
            (0, vitest_1.expect)(results.participationPercent).toBe(10);
        });
    });
    (0, vitest_1.describe)('getProposal / listProposals', () => {
        (0, vitest_1.it)('throws NotFoundException for missing proposal', async () => {
            mockProposalRepo.findOne.mockResolvedValue(null);
            await (0, vitest_1.expect)(service.getProposal('missing')).rejects.toThrow(common_1.NotFoundException);
        });
        (0, vitest_1.it)('filters proposals by status', async () => {
            mockProposalRepo.find.mockResolvedValue([]);
            await service.listProposals(proposal_entity_1.ProposalStatus.ACTIVE);
            (0, vitest_1.expect)(mockProposalRepo.find).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ where: { status: proposal_entity_1.ProposalStatus.ACTIVE } }));
        });
    });
});
