import { Repository } from 'typeorm';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';
export declare class EmailVerificationCleanupService {
    private readonly tokenRepository;
    private readonly logger;
    constructor(tokenRepository: Repository<EmailVerificationToken>);
    /**
     * Cron job running daily at midnight to prune expired or used verification tokens.
     */
    handleCron(): Promise<number>;
}
