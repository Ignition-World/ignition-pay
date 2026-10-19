import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletNetwork } from '../../wallets/dto/create-wallet.dto';

export class CreateAddressDto {
  @ApiProperty({ description: 'The deposit address string' })
  @IsString()
  address: string;

  @ApiProperty({ enum: WalletNetwork, default: WalletNetwork.STELLAR })
  @IsEnum(WalletNetwork)
  @IsOptional()
  network?: WalletNetwork = WalletNetwork.STELLAR;

  @ApiPropertyOptional({ description: 'Wallet ID to allocate this address to' })
  @IsString()
  @IsOptional()
  walletId?: string;

  @ApiPropertyOptional({ description: 'Human-readable label', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description: 'Whether the address is active',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
