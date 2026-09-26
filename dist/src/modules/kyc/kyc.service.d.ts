import { Repository, DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { KycAuditLog } from './entities/kyc-audit-log.entity';
import { KycWebhookDto } from './dto/kyc-webhook.dto';
export declare class KycService {
    private readonly userRepository;
    private readonly auditLogRepository;
    private readonly dataSource;
    private readonly logger;
    constructor(userRepository: Repository<User>, auditLogRepository: Repository<KycAuditLog>, dataSource: DataSource);
    /**
     * Processes verified KYC webhook: updates user status and records audit log in a transaction
     */
    processWebhook(payload: KycWebhookDto): Promise<void>;
}
