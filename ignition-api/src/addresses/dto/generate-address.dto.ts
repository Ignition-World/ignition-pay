import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletNetwork } from '../../wallets/dto/create-wallet.dto';

export class GenerateAddressDto {
  @ApiProperty({
    description: 'Wallet ID to associate the generated address with',
  })
  @IsString()
  walletId: string;

  @ApiPropertyOptional({ enum: WalletNetwork, default: WalletNetwork.STELLAR })
  @IsEnum(WalletNetwork)
  @IsOptional()
  network?: WalletNetwork = WalletNetwork.STELLAR;

  @ApiPropertyOptional({
    description: 'Optional label for the address',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;
}
