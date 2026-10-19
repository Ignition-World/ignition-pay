import { Injectable } from '@nestjs/common';

/**
 * Memo collision guard (Issue #419).
 * Generated deposit memos must be unique per wallet. This helper checks
 * whether a newly generated memo value already exists in the active set
 * before committing it, and provides a retry-with-salt strategy.
 */
@Injectable()
export class MemoCollisionGuard {
  isCollision(existingMemos: string[], newMemo: string): boolean {
    return existingMemos.includes(newMemo);
  }

  addSalt(memoValue: string, attempt: number): string {
    // Append attempt index as a salt to produce a different memo on retry
    return `${memoValue}${attempt}`;
  }
}