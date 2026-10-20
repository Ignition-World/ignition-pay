export interface AdminAuditEvent {
    adminId: string;
    action: string;
    targetId?: string;
    timestamp: number;
}
export declare class AdminAuditLogger {
    private events;
    logEvent(adminId: string, action: string, targetId?: string): AdminAuditEvent;
    getEvents(): AdminAuditEvent[];
}
