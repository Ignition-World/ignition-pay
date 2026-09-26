import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WalletNetwork } from '../../wallets/dto/create-wallet.dto';

export class UpdateAddressDto {
  @ApiPropertyOptional({
    description: 'Wallet ID to allocate/reallocate this address to',
  })
  @IsString()
  @IsOptional()
  walletId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ enum: WalletNetwork })
  @IsEnum(WalletNetwork)
  @IsOptional()
  network?: WalletNetwork;

  @ApiPropertyOptional({ description: 'Whether the address is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
