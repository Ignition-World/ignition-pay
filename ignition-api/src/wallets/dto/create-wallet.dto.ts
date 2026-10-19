import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletType } from '@prisma/client';

export enum WalletNetwork {
  STELLAR = 'STELLAR',
  ETHEREUM = 'ETHEREUM',
  BITCOIN = 'BITCOIN',
}

export class CreateWalletDto {
  @ApiProperty({ enum: WalletNetwork, default: WalletNetwork.STELLAR })
  @IsEnum(WalletNetwork)
  @IsOptional()
  network?: WalletNetwork = WalletNetwork.STELLAR;

  @ApiPropertyOptional({
    enum: WalletType,
    default: WalletType.CUSTODIAL,
    description:
      'CUSTODIAL wallets have keys managed server-side; NON_CUSTODIAL wallets only store a public deposit address (user controls keys).',
  })
  @IsEnum(WalletType)
  @IsOptional()
  walletType?: WalletType = WalletType.CUSTODIAL;

  @ApiPropertyOptional({
    description: 'Deposit address to assign to this wallet',
  })
  @IsString()
  @IsOptional()
  depositAddress?: string;

  @ApiPropertyOptional({
    description: 'Human-readable label for the wallet',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description: 'Daily transaction limit',
    default: 1000,
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  dailyLimit?: number;

  @ApiPropertyOptional({
    description: 'Monthly transaction limit',
    default: 10000,
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  monthlyLimit?: number;
}
