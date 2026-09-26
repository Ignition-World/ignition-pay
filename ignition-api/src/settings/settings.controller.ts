import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionGuard } from '../session/session.guard';
import { AdminGuard } from '../users/guards/admin.guard';
import { AddressGenerationThrottleMonitorService } from '../throttler/address-generation-throttle-monitor.service';
import { SettingsService, SystemSettingsDto } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('admin')
@Controller('admin/settings')
@UseGuards(SessionGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly addressGenerationThrottleMonitorService: AddressGenerationThrottleMonitorService,
  ) {}

  /**
   * GET /admin/settings
   * Retrieve current system settings (admin only)
   */
  @Get()
  @ApiOperation({ summary: 'Get current system settings (admin only)' })
  @ApiResponse({ status: 200, description: 'System settings retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  async getSettings(): Promise<SystemSettingsDto> {
    return this.settingsService.getSettings();
  }

  /**
   * PUT /admin/settings
   * Update system settings (admin only)
   */
  @Put()
  @ApiOperation({ summary: 'Update system settings (admin only)' })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  async updateSettings(
    @Body() updateSettingsDto: UpdateSettingsDto,
  ): Promise<SystemSettingsDto> {
    return this.settingsService.updateSettings(updateSettingsDto);
  }

  @Get('throttle-dashboard')
  @ApiOperation({ summary: 'Get current address-generation throttle statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Throttle statistics retrieved successfully' })
  async getThrottleDashboard() {
    return this.addressGenerationThrottleMonitorService.getCurrentStats();
  }
}