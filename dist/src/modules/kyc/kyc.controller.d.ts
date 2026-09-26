import { KycService } from './kyc.service';
import { KycWebhookDto } from './dto/kyc-webhook.dto';
export declare class KycController {
    private readonly kycService;
    constructor(kycService: KycService);
    handleWebhook(payload: KycWebhookDto): Promise<{
        success: boolean;
    }>;
}
