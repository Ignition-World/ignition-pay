export declare enum KycStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    REQUIRES_ACTION = "REQUIRES_ACTION"
}
export declare class KycWebhookDto {
    userId: string;
    applicantId: string;
    status: KycStatus;
    reason?: string;
    metadata?: Record<string, any>;
}
