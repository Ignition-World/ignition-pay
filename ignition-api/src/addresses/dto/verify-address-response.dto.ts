import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyAddressResponseDto {
  @ApiProperty({
    description: 'Whether the address is a valid Stellar Ed25519 public key',
    example: true,
  })
  valid: boolean;

  @ApiProperty({
    description: 'The address that was verified',
    example: 'GBZXN7PIRZGNMHGA7D3TLXWGABSIJHKRNM5Z7HCFVQ7WFMJDBJJLKGZ',
  })
  address: string;

  @ApiPropertyOptional({
    description: 'Human-readable reason when the address is invalid',
    example: 'Invalid StrKey checksum',
  })
  reason?: string;
}
