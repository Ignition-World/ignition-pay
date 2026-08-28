import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { User } from '../users/entities/user.entity';
import { Proposal } from './entities/proposal.entity';
import { Vote } from './entities/vote.entity';
import { GovernanceService } from './governance.service';
import { GovernanceController } from './governance.controller';
import { ProposalLifecycleService } from './tasks/proposal-lifecycle.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Proposal, Vote, User]),
  ],
  controllers: [GovernanceController],
  providers: [GovernanceService, ProposalLifecycleService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
