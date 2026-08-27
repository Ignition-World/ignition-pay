import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsUUID, Min } from 'class-validator';
import { VoteChoice } from '../entities/vote.entity';

export class CastVoteDto {
  @IsUUID()
  @IsNotEmpty()
  voterId: string;

  @IsEnum(VoteChoice)
  choice: VoteChoice;

  /** Optional vote weight; defaults to 1 when omitted. */
  @IsOptional()
  @IsInt()
  @Min(1)
  weight?: number;
}
