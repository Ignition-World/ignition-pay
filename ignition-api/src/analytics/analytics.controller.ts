import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Export analytics events as streaming JSON with chunked transfer encoding (Issue #805).
   * Streams JSON directly to avoid buffering large result sets (>100k events) in memory.
   */
  @Get('export')
  @ApiOperation({
    summary: 'Stream analytics events as chunked JSON export',
    description:
      'Streams analytics audit log events using HTTP chunked transfer encoding, preventing server OOM crashes.',
  })
  @ApiQuery({ name: 'userId', required: false, description: 'Optional user filter' })
  @ApiResponse({ status: 200, description: 'Chunked JSON stream of analytics events' })
  async exportAnalytics(
    @Res() res: Response,
    @Query('userId') userId?: string,
  ): Promise<void> {
    await this.analyticsService.streamExport(res, { userId });
  }

  /**
   * Download analytics events alias (Issue #805).
   */
  @Get('download')
  @ApiOperation({ summary: 'Download analytics events as chunked JSON' })
  @ApiQuery({ name: 'userId', required: false, description: 'Optional user filter' })
  @ApiResponse({ status: 200, description: 'Chunked JSON stream of analytics events' })
  async downloadAnalytics(
    @Res() res: Response,
    @Query('userId') userId?: string,
  ): Promise<void> {
    await this.analyticsService.streamExport(res, { userId });
  }
}
