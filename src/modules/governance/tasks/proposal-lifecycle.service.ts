import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Proposal, ProposalStatus } from '../entities/proposal.entity';

/**
 * Scheduled job that advances the proposal lifecycle without manual
 * intervention:
 *
 * - `draft` proposals whose voting window has opened are activated
 * - `active` proposals whose voting window has elapsed are tallied and
 *   closed (passed/rejected based on quorum + majority)
 */
@Injectable()
export class ProposalLifecycleService {
  private readonly logger = new Logger(ProposalLifecycleService.name);

  constructor(
    @InjectRepository(Proposal)
    private readonly proposalRepository: Repository<Proposal>,
  ) {}

  /**
   * Run hourly to open due drafts and close expired active proposals.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processLifecycle(): Promise<{ activated: number; closed: number }> {
    this.logger.log('Starting proposal lifecycle processing...');

    const now = new Date();

    // Open drafts whose voting window has started.
    const dueDrafts = await this.proposalRepository.find({
      where: {
        status: ProposalStatus.DRAFT,
        votingStartsAt: LessThanOrEqual(now),
      },
    });
    for (const proposal of dueDrafts) {
      proposal.status = ProposalStatus.ACTIVE;
      await this.proposalRepository.save(proposal);
    }

    // Close active proposals whose voting window has ended.
    const expiredActives = await this.proposalRepository.find({
      where: {
        status: ProposalStatus.ACTIVE,
        votingEndsAt: LessThanOrEqual(now),
      },
    });
    let closed = 0;
    for (const proposal of expiredActives) {
      const totalVotes = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
      const quorumMet =
        proposal.eligibleVoters > 0 &&
        totalVotes / proposal.eligibleVoters >=
          proposal.quorumThresholdPercent / 100;

      if (!quorumMet || proposal.yesVotes <= proposal.noVotes) {
        proposal.status = ProposalStatus.REJECTED;
      } else {
        proposal.status = ProposalStatus.PASSED;
      }
      proposal.tallyExecutedAt = now;
      await this.proposalRepository.save(proposal);
      closed += 1;
    }

    this.logger.log(
      `Proposal lifecycle processed: ${dueDrafts.length} activated, ${closed} closed.`,
    );
    return { activated: dueDrafts.length, closed };
  }
}
