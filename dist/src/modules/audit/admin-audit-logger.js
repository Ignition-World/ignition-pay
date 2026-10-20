"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuditLogger = void 0;
class AdminAuditLogger {
    constructor() {
        this.events = [];
    }
    logEvent(adminId, action, targetId) {
        const event = {
            adminId,
            action,
            targetId,
            timestamp: Date.now(),
        };
        this.events.push(event);
        return event;
    }
    getEvents() {
        return [...this.events];
    }
}
exports.AdminAuditLogger = AdminAuditLogger;
