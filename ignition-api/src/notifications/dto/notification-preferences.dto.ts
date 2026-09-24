import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @ApiProperty({
    description:
      'Partial map of NotificationType -> { email, push, inApp } booleans, merged over existing settings. Unknown types and channels are ignored.',
    example: { DONATION_RECEIVED: { email: true, push: false, inApp: true } },
  })
  @IsObject()
  preferences: Record<string, Partial<Record<'email' | 'push' | 'inApp', boolean>>>;
}
