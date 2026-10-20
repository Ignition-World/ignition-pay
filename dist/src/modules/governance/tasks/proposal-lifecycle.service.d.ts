import { Repository } from 'typeorm';
import { Proposal } from '../entities/proposal.entity';
/**
 * Scheduled job that advances the proposal lifecycle without manual
 * intervention:
 *
 * - `draft` proposals whose voting window has opened are activated
 * - `active` proposals whose voting window has elapsed are tallied and
 *   closed (passed/rejected based on quorum + majority)
 */
export declare class ProposalLifecycleService {
    private readonly proposalRepository;
    private readonly logger;
    constructor(proposalRepository: Repository<Proposal>);
    /**
     * Run hourly to open due drafts and close expired active proposals.
     */
    processLifecycle(): Promise<{
        activated: number;
        closed: number;
    }>;
}
