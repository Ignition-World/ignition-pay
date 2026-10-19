import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { Prisma } from '@prisma/client';
import {
  BrowseCampaignsQueryDto,
  BrowseCampaignsResponseDto,
} from './dto/browse-campaigns.dto';
import { QUEUE_EMAIL } from '../queue/queue.constants';
import {
  MILESTONE_JOB_COMPLETED,
  MILESTONE_JOB_CAMPAIGN_COMPLETED,
  MilestoneCompletedPayload,
  CampaignCompletedPayload,
} from '../queue/queue.jobs';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_EMAIL) private readonly emailQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // Milestone completion (#256)
  // ---------------------------------------------------------------------------

  /**
   * Mark a milestone as COMPLETED.
   *
   * Business rules:
   * 1. The milestone must belong to the given campaign and not already be
   *    COMPLETED or FAILED.
   * 2. The requesting user must be the campaign creator.
   * 3. When ALL milestones on the campaign are COMPLETED, the campaign itself
   *    is also marked COMPLETED.
   * 4. Non-blocking email notifications are dispatched after the DB writes
   *    so that a delivery failure never rolls back the completion.
   */
  async completeMilestone(
    userId: string,
    campaignId: string,
    milestoneId: string,
  ) {
    // 1. Load campaign + all milestones in one query to minimise round-trips
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        milestones: true,
        creator: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    // 2. Authorisation – only the campaign creator may complete milestones
    if (campaign.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the campaign creator can complete milestones',
      );
    }

    // 3. Locate the milestone
    const milestone = campaign.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new NotFoundException(
        `Milestone ${milestoneId} not found on campaign ${campaignId}`,
      );
    }

    if (milestone.status === 'COMPLETED') {
      throw new BadRequestException('Milestone is already completed');
    }

    if (milestone.status === 'FAILED') {
      throw new BadRequestException('A failed milestone cannot be completed');
    }

    // 4. Mark milestone COMPLETED
    const updatedMilestone = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // 5. Determine whether all milestones are now COMPLETED
    const allDone = campaign.milestones.every(
      (m) => m.id === milestoneId || m.status === 'COMPLETED',
    );

    let campaignCompleted = false;
    if (allDone) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED' },
      });
      campaignCompleted = true;
    }

    // 6. Dispatch notifications (non-blocking – failure is logged, not thrown)
    const creatorEmail = campaign.creator.email ?? '';
    const creatorId = campaign.creator.id;

    this.emailQueue
      .add(MILESTONE_JOB_COMPLETED, {
        creatorId,
        creatorEmail,
        campaignId,
        campaignTitle: campaign.title,
        milestoneId,
        milestoneTitle: milestone.title,
      } satisfies MilestoneCompletedPayload)
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to enqueue ${MILESTONE_JOB_COMPLETED} for milestone ${milestoneId}`,
          err instanceof Error ? err.stack : String(err),
        );
      });

    if (campaignCompleted) {
      this.emailQueue
        .add(MILESTONE_JOB_CAMPAIGN_COMPLETED, {
          creatorId,
          creatorEmail,
          campaignId,
          campaignTitle: campaign.title,
        } satisfies CampaignCompletedPayload)
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to enqueue ${MILESTONE_JOB_CAMPAIGN_COMPLETED} for campaign ${campaignId}`,
            err instanceof Error ? err.stack : String(err),
          );
        });
    }

    return {
      milestone: updatedMilestone,
      campaignCompleted,
    };
  }

  // ---------------------------------------------------------------------------
  // Existing methods (unchanged)
  // ---------------------------------------------------------------------------

  async updateCampaign(
    userId: string,
    campaignId: string,
    dto: UpdateCampaignDto,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: {
        id: campaignId,
        status: { notIn: ['CANCELLED', 'REJECTED', 'COMPLETED'] },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.creatorId !== userId) {
      throw new ForbiddenException('Only the campaign creator can update this');
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        title: dto.title ?? campaign.title,
        // Prefer explicit description, fallback to story alias
        description: dto.description ?? dto.story ?? campaign.description,
        // Map coverImageUrl to imageUrl in the DB
        imageUrl: dto.coverImageUrl ?? campaign.imageUrl,
      },
    });

    return updated;
  }

  /**
   * Browse public campaigns with pagination, filtering, and sorting
   * Excludes DRAFT campaigns from public listing
   */
  async browseCampaigns(
    query: BrowseCampaignsQueryDto,
  ): Promise<BrowseCampaignsResponseDto> {
    const { page, limit, category, status, search, sortBy } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.CampaignWhereInput = {
      // Always exclude DRAFT campaigns
      status: {
        not: 'DRAFT',
      },
    };

    // Add category filter if provided
    if (category) {
      where.category = {
        equals: category,
        mode: 'insensitive',
      };
    }

    // Add status filter if provided (in addition to default exclusions)
    if (status) {
      where.status = status as any;
    }

    // Add search filter (searches in title and description)
    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // Determine order by
    let orderBy: Prisma.CampaignOrderByWithRelationInput = {};
    switch (sortBy) {
      case 'mostFunded':
        orderBy = {
          raisedAmount: 'desc',
        };
        break;
      case 'endingSoon':
        orderBy = {
          endDate: 'asc',
        };
        break;
      case 'newest':
      default:
        orderBy = {
          createdAt: 'desc',
        };
    }

    // Fetch total count
    const total = await this.prisma.campaign.count({ where });

    // Fetch campaigns
    const campaigns = await this.prisma.campaign.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        goalAmount: true,
        raisedAmount: true,
        status: true,
        creatorId: true,
        startDate: true,
        endDate: true,
        imageUrl: true,
        category: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            walletAddress: true,
          },
        },
        _count: {
          select: {
            donations: true,
            milestones: true,
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    });

    return {
      data: campaigns,
      total,
      page,
      limit,
    };
  }

  async createCampaign(userId: string, dto: any) {
    // Prepare milestone create data if provided
    const milestoneCreates = (dto.milestones || []).map((m: any) => ({
      title: m.title,
      description: m.description ?? null,
      targetAmount: m.targetAmount ?? undefined,
      dueDate: m.dueDate ? new Date(m.dueDate) : undefined,
    }));

    const data: any = {
      title: dto.title,
      description: dto.description ?? dto.story ?? undefined,
      imageUrl: dto.coverImageUrl ?? undefined,
      category: dto.category ?? undefined,
      goalAmount: dto.goalAmount ?? undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      status: 'ACTIVE',
      creatorId: userId,
      milestones:
        milestoneCreates.length > 0 ? { create: milestoneCreates } : undefined,
    };

    const created = await this.prisma.campaign.create({
      data,
      include: { milestones: true },
    });

    return created;
  }
}
