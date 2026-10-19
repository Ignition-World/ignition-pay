import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyAddressDto {
  @ApiProperty({ description: 'Stellar address to verify' })
  @IsString()
  @IsNotEmpty()
  address: string;
}
