"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KycController = void 0;
const common_1 = require("@nestjs/common");
const webhook_signature_guard_1 = require("./guards/webhook-signature.guard");
let KycController = class KycController {
    constructor(kycService) {
        this.kycService = kycService;
    }
    async handleWebhook(payload) {
        await this.kycService.processWebhook(payload);
        return { success: true };
    }
};
exports.KycController = KycController;
__decorate([
    (0, common_1.Post)('webhook'),
    (0, common_1.UseGuards)(webhook_signature_guard_1.WebhookSignatureGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)())
], KycController.prototype, "handleWebhook", null);
exports.KycController = KycController = __decorate([
    (0, common_1.Controller)('kyc')
], KycController);
