import { Injectable } from '@nestjs/common';

@Injectable()
export class ShutdownState {
  private shuttingDown = false;

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  markShuttingDown(): void {
    this.shuttingDown = true;
  }
}
