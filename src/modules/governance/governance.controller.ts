import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { GovernanceService } from './governance.service';
import { Proposal, ProposalStatus } from './entities/proposal.entity';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ProposalResultsDto } from './dto/proposal-status.dto';

@Controller('governance')
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Post('proposals')
  async createProposal(@Body() dto: CreateProposalDto): Promise<Proposal> {
    return this.governanceService.createProposal(dto);
  }

  @Get('proposals')
  async listProposals(
    @Query('status') status?: ProposalStatus,
  ): Promise<Proposal[]> {
    return this.governanceService.listProposals(status);
  }

  @Get('proposals/:id')
  async getProposal(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Proposal> {
    return this.governanceService.getProposal(id);
  }

  @Post('proposals/:id/activate')
  async activateProposal(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Proposal> {
    return this.governanceService.activateProposal(id);
  }

  @Post('proposals/:id/votes')
  async castVote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CastVoteDto,
  ): Promise<Proposal> {
    return this.governanceService.castVote(id, dto);
  }

  @Post('proposals/:id/tally')
  async tallyAndClose(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Proposal> {
    return this.governanceService.tallyAndClose(id);
  }

  @Post('proposals/:id/execute')
  async executeProposal(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Proposal> {
    return this.governanceService.executeProposal(id);
  }

  @Get('proposals/:id/results')
  async getResults(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProposalResultsDto> {
    return this.governanceService.getResults(id);
  }
}
