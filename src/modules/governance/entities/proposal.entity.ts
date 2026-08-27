import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Lifecycle states enforced by the governance service.
 *
 * draft    → created, not yet open for voting
 * active   → voting window is open (votingStartsAt <= now <= votingEndsAt)
 * passed   → voting window closed, quorum met and yes votes outnumber no votes
 * executed → a passed proposal has been executed
 * rejected → voting window closed without quorum, or yes votes did not win
 */
export enum ProposalStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PASSED = 'passed',
  EXECUTED = 'executed',
  REJECTED = 'rejected',
}

@Entity('proposals')
export class Proposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: ProposalStatus.DRAFT })
  status: ProposalStatus;

  /** Voting window start (ISO). Votes before this are rejected. */
  @Column({ type: 'timestamp' })
  votingStartsAt: Date;

  /** Voting window end (ISO). Votes after this are rejected. */
  @Column({ type: 'timestamp' })
  votingEndsAt: Date;

  /**
   * Minimum participation, as a percentage of the eligible electorate
   * (0-100), required for a proposal outcome to be valid. If the
   * participation threshold is not met the proposal is rejected and can
   * never be executed (quorum enforcement).
   */
  @Column({ type: 'int', default: 20 })
  quorumThresholdPercent: number;

  /**
   * Snapshot of the eligible electorate taken when the proposal was
   * created. Quorum is evaluated against this snapshot so later changes
   * to the user base cannot inflate or deflate participation.
   */
  @Column({ type: 'int', default: 0 })
  eligibleVoters: number;

  @Column({ type: 'int', default: 0 })
  yesVotes: number;

  @Column({ type: 'int', default: 0 })
  noVotes: number;

  @Column({ type: 'int', default: 0 })
  abstainVotes: number;

  /** Timestamp of the tally that moved the proposal out of `active`. */
  @Column({ type: 'timestamp', nullable: true })
  tallyExecutedAt?: Date | null;

  /** Timestamp of execution for `passed` proposals. */
  @Column({ type: 'timestamp', nullable: true })
  executedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
