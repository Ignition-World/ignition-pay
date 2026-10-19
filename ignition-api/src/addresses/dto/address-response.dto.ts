import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty({ description: 'Address ID' })
  id: string;

  @ApiPropertyOptional({
    description: 'Wallet ID this address is allocated to',
  })
  walletId?: string;

  @ApiProperty({ description: 'The deposit address string' })
  address: string;

  @ApiProperty({ enum: ['STELLAR', 'ETHEREUM', 'BITCOIN'] })
  network: string;

  @ApiPropertyOptional({ description: 'Human-readable label' })
  label?: string;

  @ApiProperty({ description: 'Whether the address is active' })
  isActive: boolean;

  @ApiPropertyOptional({
    description: 'When the address was allocated to a wallet',
  })
  allocatedAt?: Date;

  @ApiPropertyOptional({ description: 'Last activity timestamp' })
  lastActivityAt?: Date;

  @ApiProperty({ description: 'When the address was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the address was last updated' })
  updatedAt: Date;
}
