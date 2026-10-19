import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DonationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

@Entity('donations')
export class Donation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 20, scale: 7 })
  amount: number;

  @Column({ default: 'XLM' })
  assetCode: string;

  @Column({ nullable: true })
  txHash?: string;

  @Column({
    type: 'enum',
    enum: DonationStatus,
    default: DonationStatus.PENDING,
  })
  status: DonationStatus;

  @Column()
  donorId: string;

  @Column()
  campaignId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  donor?: any;
  recipient?: any;
  campaign?: any;
}
