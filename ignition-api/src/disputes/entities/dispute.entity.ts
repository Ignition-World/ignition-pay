import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Donation } from '../../donations/entities/donation.entity';

export enum DisputeStatus {
  OPEN = 'OPEN',
  OPENED = 'OPENED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  RESOLVED_REFUNDED = 'RESOLVED_REFUNDED',
  RESOLVED_REJECTED = 'RESOLVED_REJECTED',
  REJECTED = 'REJECTED',
}

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  donationId: string;

  @ManyToOne(() => Donation, { eager: true })
  @JoinColumn({ name: 'donationId' })
  donation: Donation;

  @Column()
  filerId: string;

  @Column()
  campaignId: string;

  @Column()
  reason: string;

  @Column()
  description: string;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.OPENED,
  })
  status: DisputeStatus;

  @Column({ nullable: true })
  resolvedBy?: string;

  @Column({ nullable: true })
  resolutionNotes?: string;

  @Column({ nullable: true })
  resolvedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  donor?: any;
  recipient?: any;
  campaign?: any;
}
