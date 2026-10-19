import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('wallets')
@Index('wallet_user_asset_unique', ['userId', 'assetCode'], { unique: true })
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 10, default: 'XLM' })
  assetCode!: string;

  /**
   * Ledger balance in stroops. Stored as a `bigint` column so amounts stay
   * exact; TypeORM surfaces `bigint` columns as strings, so every read is
   * converted with `BigInt(...)` before arithmetic. The balance value itself
   * doubles as the optimistic-concurrency token used by the compare-and-swap
   * update in `WalletsService.applyBalanceDelta` (issue #587).
   */
  @Column({ type: 'bigint', default: 0 })
  balance!: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
