import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHash, randomBytes } from 'crypto';
import { Request } from 'express';
import { AdminGuard } from '../users/guards/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions/permissions.guard';
import { Permission } from '../auth/permissions/permissions.map';
import { RequirePermissions } from '../auth/permissions/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import {
  ApiKeyErrorResponseDto,
  ApiKeyListResponseDto,
  ApiKeySummaryDto,
  ApiKeyUserListResponseDto,
  CreateApiKeyResponseDto,
  FinalizeRotationResponseDto,
  MessageResponseDto,
} from './dto/api-key-response.dto';

interface JwtUser {
  sub: string;
  walletAddress: string;
  role: string;
}

/**
 * Management surface for the `X-API-Key` credentials that the resource routes
 * (e.g. `GET /transactions`) authenticate with. These routes themselves use a
 * **JWT bearer** token — the same `JWT-auth` scheme registered by the
 * `DocumentBuilder` in `main.ts` — obtained from `POST /auth/verify` (wallet
 * signature) or `POST /auth/refresh`.
 *
 * Only a SHA-256 digest of each key is stored, so a key is shown exactly once
 * at creation/rotation time and cannot be recovered afterwards.
 */
@ApiTags('api-keys')
@ApiBearerAuth('JWT-auth')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @Throttle({
    strict: {
      limit: process.env.THROTTLE_STRICT_LIMIT
        ? Number(process.env.THROTTLE_STRICT_LIMIT)
        : 5,
      ttl: process.env.THROTTLE_STRICT_TTL
        ? Number(process.env.THROTTLE_STRICT_TTL)
        : 60_000,
    },
  })
  @ApiOperation({
    summary: 'Create a new API key',
    description:
      'Mints an `sk_`-prefixed key, stores only its SHA-256 digest plus a 12-character ' +
      'display prefix, and returns the raw key once. New keys are created with `read` scope. ' +
      'Rate limited on the `strict` bucket.',
  })
  @ApiResponse({
    status: 201,
    description: 'API key successfully created; `key` is returned only here',
    type: CreateApiKeyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid payload', type: ApiKeyErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiKeyErrorResponseDto })
  @ApiResponse({
    status: 409,
    description: 'An active API key already exists for this prefix',
    type: ApiKeyErrorResponseDto,
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async create(
    @Body() body: CreateApiKeyDto,
    @Req() req: Request & { user: JwtUser },
  ) {
    const rawKey = `sk_${randomBytes(32).toString('hex')}`;
    const prefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const existingActiveKey = await this.prisma.apiKey.findFirst({
      where: {
        prefix,
        isActive: true,
      },
    });

    if (existingActiveKey) {
      throw new ConflictException(
        'An active API key already exists for this prefix',
      );
    }

    const apiKey = await this.prisma.apiKey.create({
      data: {
        userId: req.user.sub,
        name: body.name ?? `API Key ${new Date().toISOString().slice(0, 10)}`,
        keyHash,
        prefix,
        scope: 'read',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: 'ADMIN_ACTION',
        resourceType: 'ApiKey',
        resourceId: apiKey.id,
        details: JSON.stringify({
          action: 'API_KEY_CREATED',
          prefix,
          scope: 'read',
        }),
      },
    });

    // Return the raw key only once — it cannot be recovered after this response
    return {
      id: apiKey.id,
      key: rawKey,
      prefix: apiKey.prefix,
      scope: apiKey.scope,
      createdAt: apiKey.createdAt,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List all API keys for the authenticated user',
    description:
      'Returns the caller keys newest first. Raw keys are never included, only the display prefix and lifecycle state.',
  })
  @ApiResponse({
    status: 200,
    description: 'API keys retrieved successfully',
    type: ApiKeyListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiKeyErrorResponseDto })
  async list(@Req() req: Request & { user: JwtUser }) {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        userId: req.user.sub,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scope: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        expiresAt: true,
        rotationOfId: true,
        rotationExpiresAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { apiKeys: apiKeys.map((key) => this.toSummary(key)) };
  }

  @Get('admin/users/:userId')
  @UseGuards(JwtAuthGuard, AdminGuard, PermissionsGuard)
  @RequirePermissions(Permission.APIKEY_MANAGE_ANY)
  @ApiOperation({
    summary: 'List API keys for a specific user (admin)',
    description:
      'Requires the `apikey:manage:any` permission in addition to a valid JWT. The target user does not need to be the caller.',
  })
  @ApiResponse({
    status: 200,
    description: 'User API keys retrieved successfully',
    type: ApiKeyUserListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiKeyErrorResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Caller is not an admin or lacks the apikey:manage:any permission',
    type: ApiKeyErrorResponseDto,
  })
  async listForUser(@Param('userId') userId: string) {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scope: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        expiresAt: true,
        rotationOfId: true,
        rotationExpiresAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      userId,
      apiKeys: apiKeys.map((key) => this.toSummary(key)),
    };
  }

  /**
   * Map a raw ApiKey row to its public summary shape, adding a lifecycle
   * `status`: `active`, `rotating` (old key kept alive during the rotation
   * grace period), or `revoked`.
   */
  private toSummary(apiKey: {
    id: string;
    name: string;
    prefix: string;
    scope: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    lastUsedAt?: Date | null;
    expiresAt?: Date | null;
    rotationOfId?: string | null;
    rotationExpiresAt?: Date | null;
  }) {
    const isRotating =
      apiKey.isActive &&
      apiKey.rotationOfId !== null &&
      apiKey.rotationExpiresAt !== null &&
      apiKey.rotationExpiresAt! > new Date();

    return {
      ...apiKey,
      status: !apiKey.isActive
        ? 'revoked'
        : isRotating
          ? 'rotating'
          : 'active',
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update API key metadata',
    description:
      'Only `name` is mutable. Scope and lifecycle are changed through rotation and revocation.',
  })
  @ApiResponse({ status: 200, description: 'API key updated successfully', type: ApiKeySummaryDto })
  @ApiResponse({ status: 400, description: 'Invalid payload', type: ApiKeyErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiKeyErrorResponseDto })
  @ApiResponse({ status: 404, description: 'API key not found', type: ApiKeyErrorResponseDto })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateApiKeyDto,
    @Req() req: Request & { user: JwtUser },
  ) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        id,
        userId: req.user.sub,
      },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scope: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        expiresAt: true,
        rotationOfId: true,
        rotationExpiresAt: true,
      },
    });

    return this.toSummary(updated);
  }

  @Post(':id/rotate')
  @Throttle({
    strict: {
      limit: process.env.THROTTLE_STRICT_LIMIT
        ? Number(process.env.THROTTLE_STRICT_LIMIT)
        : 5,
      ttl: process.env.THROTTLE_STRICT_TTL
        ? Number(process.env.THROTTLE_STRICT_TTL)
        : 60_000,
    },
  })
  @ApiOperation({
    summary:
      'Rotate an API key without downtime (old key stays active during grace period)',
    description:
      'Issues a replacement key carrying the same name and scope. The old key keeps working for a 7 day grace period and is then rejected by `ApiKeyGuard`; finalize or cancel to end it sooner. The new raw key is returned once.',
  })
  @ApiResponse({ status: 200, description: 'API key rotated successfully', type: CreateApiKeyResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiKeyErrorResponseDto })
  @ApiResponse({ status: 404, description: 'API key not found', type: ApiKeyErrorResponseDto })
  @ApiResponse({
    status: 409,
    description: 'API key is revoked, or a rotation is already in progress',
    type: ApiKeyErrorResponseDto,
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async rotate(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    const existingKey = await this.prisma.apiKey.findFirst({
      where: {
        id,
        userId: req.user.sub,
      },
    });

    if (!existingKey) {
      throw new NotFoundException('API key not found');
    }

    if (!existingKey.isActive) {
      throw new ConflictException('Cannot rotate a revoked API key');
    }

    // Check if this key is already in rotation
    if (
      existingKey.rotationExpiresAt &&
      existingKey.rotationExpiresAt > new Date()
    ) {
      throw new ConflictException(
        'This API key is already in rotation. Finalize or cancel the existing rotation first.',
      );
    }

    // Generate new key
    const rawKey = `sk_${randomBytes(32).toString('hex')}`;
    const prefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    // Set rotation grace period to 7 days
    const rotationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create new key with same metadata
    const newApiKey = await this.prisma.apiKey.create({
      data: {
        userId: req.user.sub,
        name: existingKey.name,
        keyHash,
        prefix,
        scope: existingKey.scope,
      },
    });

    // Mark old key as being rotated (keep it active during grace period)
    await this.prisma.apiKey.update({
      where: { id },
      data: {
        rotationOfId: newApiKey.id,
        rotationExpiresAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: 'ADMIN_ACTION',
        resourceType: 'ApiKey',
        resourceId: id,
        details: JSON.stringify({
          action: 'API_KEY_ROTATION_STARTED',
          newKeyId: newApiKey.id,
          rotationExpiresAt: rotationExpiresAt.toISOString(),
        }),
      },
    });

    // Return the new raw key only once
    return {
      id: newApiKey.id,
      key: rawKey,
      prefix: newApiKey.prefix,
      scope: newApiKey.scope,
      createdAt: newApiKey.createdAt,
      rotationExpiresAt,
      message:
        'Old key remains active for 7 days. Use POST /api-keys/:id/rotate/finalize to complete rotation early, or POST /api-keys/:id/rotate/cancel to cancel.',
    };
  }

  @Post(':id/rotate/finalize')
  @Throttle({
    strict: {
      limit: process.env.THROTTLE_STRICT_LIMIT
        ? Number(process.env.THROTTLE_STRICT_LIMIT)
        : 5,
      ttl: process.env.THROTTLE_STRICT_TTL
        ? Number(process.env.THROTTLE_STRICT_TTL)
        : 60_000,
    },
  })
  @ApiOperation({
    summary: 'Finalize key rotation (immediately revoke the old key)',
    description:
      'Ends the grace period early by revoking the old key. The replacement key is untouched.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rotation finalized, old key revoked',
    type: FinalizeRotationResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiKeyErrorResponseDto })
  @ApiResponse({ status: 404, description: 'API key not found', type: ApiKeyErrorResponseDto })
  @ApiResponse({
    status: 409,
    description: 'API key is not currently in rotation',
    type: ApiKeyErrorResponseDto,
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async finalizeRotation(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    const existingKey = await this.prisma.apiKey.findFirst({
      where: {
        id,
        userId: req.user.sub,
      },
    });

    if (!existingKey) {
      throw new NotFoundException('API key not found');
    }

    if (!existingKey.rotationOfId || !existingKey.rotationExpiresAt) {
      throw new ConflictException('This API key is not in rotation');
    }

    // Revoke the old key
    await this.prisma.apiKey.update({
      where: { id },
      data: {
        isActive: false,
        rotationExpiresAt: new Date(), // Mark as finalized now
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: 'ADMIN_ACTION',
        resourceType: 'ApiKey',
        resourceId: id,
        details: JSON.stringify({
          action: 'API_KEY_ROTATION_FINALIZED',
          newKeyId: existingKey.rotationOfId,
        }),
      },
    });

    return {
      message: 'Rotation finalized. Old key has been revoked.',
      newKeyId: existingKey.rotationOfId,
    };
  }

  @Post(':id/rotate/cancel')
  @Throttle({
    strict: {
      limit: process.env.THROTTLE_STRICT_LIMIT
        ? Number(process.env.THROTTLE_STRICT_LIMIT)
        : 5,
      ttl: process.env.THROTTLE_STRICT_TTL
        ? Number(process.env.THROTTLE_STRICT_TTL)
        : 60_000,
    },
  })
  @ApiOperation({
    summary: 'Cancel key rotation (revoke the new key, keep old key active)',
    description:
      'Abandons an in-progress rotation: the replacement key is revoked and the original key is left active with its rotation fields cleared.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rotation cancelled, new key revoked',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiKeyErrorResponseDto })
  @ApiResponse({ status: 404, description: 'API key not found', type: ApiKeyErrorResponseDto })
  @ApiResponse({
    status: 409,
    description: 'API key is not currently in rotation',
    type: ApiKeyErrorResponseDto,
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async cancelRotation(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    const existingKey = await this.prisma.apiKey.findFirst({
      where: {
        id,
        userId: req.user.sub,
      },
    });

    if (!existingKey) {
      throw new NotFoundException('API key not found');
    }

    if (!existingKey.rotationOfId || !existingKey.rotationExpiresAt) {
      throw new ConflictException('This API key is not in rotation');
    }

    // Revoke the new key
    await this.prisma.apiKey.update({
      where: { id: existingKey.rotationOfId },
      data: { isActive: false },
    });

    // Clear rotation fields on the old key
    await this.prisma.apiKey.update({
      where: { id },
      data: {
        rotationOfId: null,
        rotationExpiresAt: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: 'ADMIN_ACTION',
        resourceType: 'ApiKey',
        resourceId: id,
        details: JSON.stringify({
          action: 'API_KEY_ROTATION_CANCELLED',
          revokedKeyId: existingKey.rotationOfId,
        }),
      },
    });

    return {
      message:
        'Rotation cancelled. New key has been revoked, old key remains active.',
    };
  }

  @Delete(':id')
  @Throttle({
    strict: {
      limit: process.env.THROTTLE_STRICT_LIMIT
        ? Number(process.env.THROTTLE_STRICT_LIMIT)
        : 5,
      ttl: process.env.THROTTLE_STRICT_TTL
        ? Number(process.env.THROTTLE_STRICT_TTL)
        : 60_000,
    },
  })
  @ApiOperation({
    summary: 'Revoke an API key',
    description:
      'Irreversibly deactivates the key. Requests presenting it afterwards fail with 401.',
  })
  @ApiResponse({ status: 200, description: 'API key successfully revoked', type: MessageResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiKeyErrorResponseDto })
  @ApiResponse({ status: 404, description: 'API key not found', type: ApiKeyErrorResponseDto })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async revoke(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    const result = await this.prisma.apiKey.updateMany({
      where: {
        id,
        userId: req.user.sub,
      },
      data: {
        isActive: false,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.sub,
        action: 'ADMIN_ACTION',
        resourceType: 'ApiKey',
        resourceId: id,
        details: JSON.stringify({
          action: 'API_KEY_REVOKED',
        }),
      },
    });

    return { message: 'API key revoked successfully' };
  }
}
