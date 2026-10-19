import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { RequireScope } from '../api-keys/decorators/require-scope.decorator';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressResponseDto } from './dto/address-response.dto';
import { GenerateAddressDto } from './dto/generate-address.dto';
import { VerifyAddressDto } from './dto/verify-address.dto';
import { VerifyAddressResponseDto } from './dto/verify-address-response.dto';
import { GenerateMemoDto } from './dto/generate-memo.dto';
import { ValidateMemoDto } from './dto/validate-memo.dto';
import { ResolveDepositDto } from './dto/resolve-deposit.dto';
import { Throttle } from '@nestjs/throttler';
import { ADDRESS_GENERATION_THROTTLE } from './address-generation.throttle';

@ApiTags('addresses')
@ApiBearerAuth()
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiOperation({ summary: 'Create a new deposit address' })
  @ApiResponse({
    status: 201,
    description: 'Address created',
    type: AddressResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Address already exists' })
  create(@Body() dto: CreateAddressDto): Promise<AddressResponseDto> {
    return this.addressesService.create(dto);
  }

  @Get()
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({ summary: 'List all deposit addresses' })
  @ApiResponse({
    status: 200,
    description: 'List of addresses',
    type: [AddressResponseDto],
  })
  findAll(): Promise<AddressResponseDto[]> {
    return this.addressesService.findAll();
  }

  

  @Get(':id')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({ summary: 'Get a deposit address by ID' })
  @ApiResponse({
    status: 200,
    description: 'Address found',
    type: AddressResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Address not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AddressResponseDto> {
    return this.addressesService.findOne(id);
  }

  @Get('wallet/:walletId')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({ summary: 'Get addresses by wallet ID' })
  @ApiResponse({
    status: 200,
    description: 'Addresses for wallet',
    type: [AddressResponseDto],
  })
  findByWallet(
    @Param('walletId', ParseUUIDPipe) walletId: string,
  ): Promise<AddressResponseDto[]> {
    return this.addressesService.findByWallet(walletId);
  }

  @Put(':id')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiOperation({ summary: 'Update a deposit address' })
  @ApiResponse({
    status: 200,
    description: 'Address updated',
    type: AddressResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Address not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiOperation({ summary: 'Delete a deposit address' })
  @ApiResponse({ status: 200, description: 'Address deleted' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.addressesService.remove(id);
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Verify a Stellar address',
    description:
      'Validates the G-prefix and CRC-16 StrKey checksum of a Stellar Ed25519 public key server-side.',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result (always 200; check the `valid` field)',
    type: VerifyAddressResponseDto,
  })
  verify(@Body() dto: VerifyAddressDto): VerifyAddressResponseDto {
    return this.addressesService.verifyAddress(dto.address);
  }

  @Post('generate')
  @Throttle({
    default: {
      limit: ADDRESS_GENERATION_THROTTLE.limit,
      ttl: ADDRESS_GENERATION_THROTTLE.ttl,
    },
  })
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('write')
  @ApiOperation({ summary: 'Generate a new deposit address for a wallet' })
  @ApiResponse({ status: 201, description: 'Address generated and allocated' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async generate(@Request() req: any, @Body() dto: GenerateAddressDto) {
    return this.addressesService.generate(req.user.sub, dto);
  }

  @Get('wallet/:walletId/user')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireScope('read')
  @ApiOperation({
    summary: 'List all deposit addresses for a wallet belonging to user',
  })
  @ApiResponse({ status: 200, description: 'List of deposit addresses' })
  async listByWallet(@Request() req: any, @Param('walletId') walletId: string) {
    return this.addressesService.listByWallet(req.user.sub, walletId);
  }

  @Post('memo/generate')
  @ApiOperation({ summary: 'Generate a deposit memo for a wallet' })
  @ApiResponse({ status: 201, description: 'Memo generated' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async generateMemo(@Request() req: any, @Body() dto: GenerateMemoDto) {
    return this.addressesService.generateMemo(req.user.sub, dto);
  }

  @Post('memo/validate')
  @ApiOperation({ summary: 'Validate memo format and deposit routability' })
  @ApiResponse({ status: 200, description: 'Memo validation result' })
  async validateMemo(@Body() dto: ValidateMemoDto) {
    return this.addressesService.validateMemo(dto);
  }

  @Post('resolve-deposit')
  @ApiOperation({
    summary: 'Resolve deposit attribution to target user/wallet from address and memo',
  })
  @ApiResponse({ status: 200, description: 'Deposit resolution result' })
  async resolveDeposit(@Body() dto: ResolveDepositDto) {
    return this.addressesService.resolveDeposit(dto);
  }
}
