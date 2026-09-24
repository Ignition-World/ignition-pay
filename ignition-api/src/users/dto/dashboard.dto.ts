import { ApiProperty } from '@nestjs/swagger';

export class DashboardWalletDto {
  @ApiProperty() id: string;
  @ApiProperty() network: string;
  @ApiProperty() balance: string;
  @ApiProperty() currency: string;
  @ApiProperty() status: string;
}

export class DashboardTransactionDto {
  @ApiProperty() id: string;
  @ApiProperty() amount: string;
  @ApiProperty() assetCode: string;
  @ApiProperty() status: string;
  @ApiProperty() createdAt: Date;
}

export class DashboardNotificationDto {
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty() title: string;
  @ApiProperty() createdAt: Date;
}

export class DashboardCampaignDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() goalAmount: string;
  @ApiProperty() raisedAmount: string;
}

export class DashboardProfileDto {
  @ApiProperty() id: string;
  @ApiProperty({ required: false }) email?: string;
  @ApiProperty({ required: false }) displayName?: string;
  @ApiProperty({ required: false }) avatarUrl?: string;
  @ApiProperty() role: string;
  @ApiProperty() kycStatus: string;
}

export class UserDashboardDto {
  @ApiProperty({ type: DashboardProfileDto })
  profile: DashboardProfileDto;

  @ApiProperty({ type: [DashboardWalletDto] })
  wallets: DashboardWalletDto[];

  @ApiProperty({ type: [DashboardTransactionDto] })
  recentTransactions: DashboardTransactionDto[];

  @ApiProperty({ type: [DashboardNotificationDto] })
  unreadNotifications: DashboardNotificationDto[];

  @ApiProperty({ type: [DashboardCampaignDto] })
  activeCampaigns: DashboardCampaignDto[];
}
