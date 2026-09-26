import { GovernanceService } from './governance.service';
import { Proposal, ProposalStatus } from './entities/proposal.entity';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ProposalResultsDto } from './dto/proposal-status.dto';
export declare class GovernanceController {
    private readonly governanceService;
    constructor(governanceService: GovernanceService);
    createProposal(dto: CreateProposalDto): Promise<Proposal>;
    listProposals(status?: ProposalStatus): Promise<Proposal[]>;
    getProposal(id: string): Promise<Proposal>;
    activateProposal(id: string): Promise<Proposal>;
    castVote(id: string, dto: CastVoteDto): Promise<Proposal>;
    tallyAndClose(id: string): Promise<Proposal>;
    executeProposal(id: string): Promise<Proposal>;
    getResults(id: string): Promise<ProposalResultsDto>;
}
