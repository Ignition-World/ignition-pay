import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_EMAIL } from '../queue.constants';
import {
  MILESTONE_JOB_COMPLETED,
  MILESTONE_JOB_CAMPAIGN_COMPLETED,
  MilestoneCompletedPayload,
  CampaignCompletedPayload,
} from '../queue.jobs';

/**
 * Processes milestone-related notification jobs dispatched on the email queue.
 *
 * Both job names are handled here rather than in EmailProcessor so that
 * milestone logic stays isolated and easy to extend (e.g. with a dedicated
 * push-notification step).
 */
@Processor(QUEUE_EMAIL)
export class MilestoneProcessor {
  private readonly logger = new Logger(MilestoneProcessor.name);

  @Process(MILESTONE_JOB_COMPLETED)
  async handleMilestoneCompleted(
    job: Job<MilestoneCompletedPayload>,
  ): Promise<void> {
    const {
      creatorId,
      creatorEmail,
      campaignId,
      campaignTitle,
      milestoneId,
      milestoneTitle,
    } = job.data;

    if (
      !creatorId ||
      !creatorEmail ||
      !campaignId ||
      !milestoneId ||
      !milestoneTitle
    ) {
      throw new Error('Missing required fields for milestone-completed job');
    }

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_EMAIL,
        jobId: job.id,
        jobName: MILESTONE_JOB_COMPLETED,
        creatorId,
        campaignId,
        milestoneId,
      }),
    );

    // Email delivery is logged here until an SMTP provider is wired in.
    this.logger.debug(
      `Milestone completed notification queued for ${creatorEmail} — ` +
        `campaign "${campaignTitle}", milestone "${milestoneTitle}"`,
    );
  }

  @Process(MILESTONE_JOB_CAMPAIGN_COMPLETED)
  async handleCampaignCompleted(
    job: Job<CampaignCompletedPayload>,
  ): Promise<void> {
    const { creatorId, creatorEmail, campaignId, campaignTitle } = job.data;

    if (!creatorId || !creatorEmail || !campaignId) {
      throw new Error('Missing required fields for campaign-completed job');
    }

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_EMAIL,
        jobId: job.id,
        jobName: MILESTONE_JOB_CAMPAIGN_COMPLETED,
        creatorId,
        campaignId,
      }),
    );

    this.logger.debug(
      `Campaign completed notification queued for ${creatorEmail} — ` +
        `campaign "${campaignTitle}"`,
    );
  }
}
