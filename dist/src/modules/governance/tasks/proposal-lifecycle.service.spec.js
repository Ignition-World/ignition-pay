"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("@nestjs/typeorm");
const vitest_1 = require("vitest");
const proposal_lifecycle_service_1 = require("./proposal-lifecycle.service");
const proposal_entity_1 = require("../entities/proposal.entity");
(0, vitest_1.describe)('ProposalLifecycleService (auto lifecycle advancement)', () => {
    let service;
    const mockProposalRepo = {
        find: vitest_1.vi.fn(),
        save: vitest_1.vi.fn(),
    };
    (0, vitest_1.beforeEach)(async () => {
        mockProposalRepo.find.mockReset();
        mockProposalRepo.save.mockReset();
        mockProposalRepo.save.mockImplementation((p) => Promise.resolve(p));
        const module = await testing_1.Test.createTestingModule({
            providers: [
                proposal_lifecycle_service_1.ProposalLifecycleService,
                { provide: (0, typeorm_1.getRepositoryToken)(proposal_entity_1.Proposal), useValue: mockProposalRepo },
            ],
        }).compile();
        service = module.get(proposal_lifecycle_service_1.ProposalLifecycleService);
    });
    (0, vitest_1.it)('activates due drafts and closes expired active proposals', async () => {
        const now = new Date('2026-08-01T12:00:00Z');
        mockProposalRepo.find.mockImplementation((opts) => {
            const { where } = opts;
            if (where.status === proposal_entity_1.ProposalStatus.DRAFT) {
                return Promise.resolve([
                    { id: 'p1', status: proposal_entity_1.ProposalStatus.DRAFT, votingStartsAt: now },
                ]);
            }
            // expired active proposals
            return Promise.resolve([
                {
                    id: 'p2',
                    status: proposal_entity_1.ProposalStatus.ACTIVE,
                    votingEndsAt: now,
                    eligibleVoters: 100,
                    quorumThresholdPercent: 50,
                    yesVotes: 60,
                    noVotes: 10,
                    abstainVotes: 5,
                },
                {
                    id: 'p3',
                    status: proposal_entity_1.ProposalStatus.ACTIVE,
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
        (0, vitest_1.expect)(result.activated).toBe(1);
        (0, vitest_1.expect)(result.closed).toBe(2);
        (0, vitest_1.expect)(mockProposalRepo.save).toHaveBeenCalledTimes(3);
        const saved = mockProposalRepo.save.mock.calls.map(([p]) => p);
        const p2 = saved.find((p) => p.id === 'p2');
        const p3 = saved.find((p) => p.id === 'p3');
        (0, vitest_1.expect)(p2.status).toBe(proposal_entity_1.ProposalStatus.PASSED); // quorum met, yes wins
        (0, vitest_1.expect)(p3.status).toBe(proposal_entity_1.ProposalStatus.REJECTED); // no wins
        (0, vitest_1.expect)(p3.tallyExecutedAt).toBeInstanceOf(Date);
    });
    (0, vitest_1.it)('rejects active proposals that fail quorum', async () => {
        mockProposalRepo.find.mockImplementation((opts) => {
            const { where } = opts;
            if (where.status === proposal_entity_1.ProposalStatus.DRAFT) {
                return Promise.resolve([]);
            }
            return Promise.resolve([
                {
                    id: 'p4',
                    status: proposal_entity_1.ProposalStatus.ACTIVE,
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
        (0, vitest_1.expect)(result.closed).toBe(1);
        const saved = mockProposalRepo.save.mock.calls.map(([p]) => p);
        (0, vitest_1.expect)(saved[0].status).toBe(proposal_entity_1.ProposalStatus.REJECTED); // 25% < 50% quorum
    });
});
