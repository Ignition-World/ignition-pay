import { Controller, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Patch(':id/resolve')
  @Roles('ADMIN')
  async resolveDispute(
    @Param('id') disputeId: string,
    @Req() req: any,
    @Body() dto: ResolveDisputeDto,
  ) {
    const adminId = req.user.id;
    return this.disputesService.resolveDispute(disputeId, adminId, dto);
  }
}