import {
  Controller,
  Post,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Sep24Service } from './sep24.service'
import { Sep24WebhookGuard } from './sep24-webhook.guard'

/**
 * Sep24CallbackController
 *
 * Handles two types of SEP-24 anchor callbacks:
 *
 * 1. POST /sep24/callback/:token  (Issue #427)
 *    Legacy opaque-token callback — no auth headers required.
 *    The token embedded in the URL authenticates the request.
 *
 * 2. POST /sep24/callbacks/:anchorId  (Issue #590)
 *    Webhook-signature callback — requires Webhook-Id and Webhook-Signature
 *    headers. Sep24WebhookGuard verifies the signature before the handler runs.
 */
@ApiTags('sep24')
@Controller('sep24')
export class Sep24CallbackController {
  private readonly logger = new Logger(Sep24CallbackController.name)

  constructor(private readonly sep24Service: Sep24Service) {}

  // ── Legacy token-in-URL callback (Issue #427) ─────────────────────────────

  @Post('callback/:token')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'SEP-24 async status callback (invoked by the anchor, not the client)',
  })
  @ApiResponse({ status: 200, description: 'Callback accepted and status updated' })
  @ApiResponse({ status: 404, description: 'Unknown callback token' })
  @ApiResponse({ status: 400, description: 'Invalid callback payload' })
  async callback(
    @Param('token') token: string,
    @Body() payload: Record<string, any>,
  ): Promise<{ ok: true }> {
    await this.sep24Service.handleCallback(token, payload)
    return { ok: true }
  }

  // ── Webhook-signature callback (Issue #590) ───────────────────────────────

  /**
   * POST /sep24/callbacks/:anchorId
   *
   * Anchor sends a signed payload when a SEP-24 transaction status changes.
   * Sep24WebhookGuard validates Webhook-Id + Webhook-Signature before this runs,
   * returning 401 for any missing or invalid signature.
   *
   * Signed payload convention: "<Webhook-Id>.<rawBody>"
   * Signature header format:   "v1,<base64-encoded-signature>"
   */
  @Post('callbacks/:anchorId')
  @UseGuards(Sep24WebhookGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({
    summary: 'SEP-24 webhook callback with signature verification (Issue #590)',
    description:
      'Called by anchors when a SEP-24 transaction status changes. ' +
      'Requests must carry valid Webhook-Id and Webhook-Signature headers. ' +
      'Returns 401 for missing or invalid signatures.',
  })
  @ApiParam({ name: 'anchorId', description: 'Anchor slug (e.g. "circle")' })
  @ApiHeader({
    name: 'Webhook-Id',
    required: true,
    description: 'Unique ID for this webhook delivery',
  })
  @ApiHeader({
    name: 'Webhook-Signature',
    required: true,
    description: 'v1,<base64-encoded-signature> signed over "<Webhook-Id>.<rawBody>"',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Webhook accepted' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid or missing signature' })
  handleSignedCallback(
    @Param('anchorId') anchorId: string,
    @Headers('webhook-id') webhookId: string,
    @Body() payload: Record<string, unknown>,
  ): { received: boolean } {
    this.logger.log(
      `SEP-24 signed callback received from anchor "${anchorId}" for Webhook-Id "${webhookId}"`,
    )
    this.logger.debug(`SEP-24 payload keys: ${Object.keys(payload).join(', ')}`)

    // TODO: dispatch to Sep24Service for transaction-status processing
    return { received: true }
  }
}
