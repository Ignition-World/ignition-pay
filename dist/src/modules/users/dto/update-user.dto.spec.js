"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const class_validator_1 = require("class-validator");
const vitest_1 = require("vitest");
const update_user_dto_1 = require("./update-user.dto");
(0, vitest_1.describe)('UpdateUserDto Validation', () => {
    (0, vitest_1.it)('should pass with valid data', async () => {
        const dto = new update_user_dto_1.UpdateUserDto();
        dto.displayName = 'John Doe';
        dto.phone = '+14155552671';
        dto.avatar = 'https://example.com/avatar.png';
        const errors = await (0, class_validator_1.validate)(dto);
        (0, vitest_1.expect)(errors.length).toBe(0);
    });
    (0, vitest_1.it)('should fail when displayName is too short', async () => {
        const dto = new update_user_dto_1.UpdateUserDto();
        dto.displayName = 'A';
        const errors = await (0, class_validator_1.validate)(dto);
        (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(errors[0].property).toBe('displayName');
    });
    (0, vitest_1.it)('should fail when phone is not E.164 compliant', async () => {
        const dto = new update_user_dto_1.UpdateUserDto();
        dto.phone = '123-456-7890'; // Missing leading + and country code
        const errors = await (0, class_validator_1.validate)(dto);
        (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(errors[0].property).toBe('phone');
    });
    (0, vitest_1.it)('should fail when avatar is an invalid URL', async () => {
        const dto = new update_user_dto_1.UpdateUserDto();
        dto.avatar = 'not-a-valid-url';
        const errors = await (0, class_validator_1.validate)(dto);
        (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(errors[0].property).toBe('avatar');
    });
});
