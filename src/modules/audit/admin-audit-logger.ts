export interface AdminAuditEvent {
  adminId: string;
  action: string;
  targetId?: string;
  timestamp: number;
}

export class AdminAuditLogger {
  private events: AdminAuditEvent[] = [];

  public logEvent(adminId: string, action: string, targetId?: string): AdminAuditEvent {
    const event: AdminAuditEvent = {
      adminId,
      action,
      targetId,
      timestamp: Date.now(),
    };
    this.events.push(event);
    return event;
  }

  public getEvents(): AdminAuditEvent[] {
    return [...this.events];
  }
}
