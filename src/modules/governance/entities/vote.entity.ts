import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  CreateDateColumn,
} from 'typeorm';

export enum VoteChoice {
  YES = 'yes',
  NO = 'no',
  ABSTAIN = 'abstain',
}

@Entity('votes')
@Unique(['proposalId', 'voterId'])
export class Vote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  proposalId: string;

  @Index()
  @Column({ type: 'uuid' })
  voterId: string;

  @Column({ type: 'varchar', length: 10 })
  choice: VoteChoice;

  /** Vote weight (default 1); a voter may only cast one vote per proposal. */
  @Column({ type: 'int', default: 1 })
  weight: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
