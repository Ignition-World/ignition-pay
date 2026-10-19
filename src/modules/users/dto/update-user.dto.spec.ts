import { validate } from 'class-validator';
import { describe, it, expect } from 'vitest';
import { UpdateUserDto } from './update-user.dto';

describe('UpdateUserDto Validation', () => {
  it('should pass with valid data', async () => {
    const dto = new UpdateUserDto();
    dto.displayName = 'John Doe';
    dto.phone = '+14155552671';
    dto.avatar = 'https://example.com/avatar.png';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when displayName is too short', async () => {
    const dto = new UpdateUserDto();
    dto.displayName = 'A';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('displayName');
  });

  it('should fail when phone is not E.164 compliant', async () => {
    const dto = new UpdateUserDto();
    dto.phone = '123-456-7890'; // Missing leading + and country code

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('phone');
  });

  it('should fail when avatar is an invalid URL', async () => {
    const dto = new UpdateUserDto();
    dto.avatar = 'not-a-valid-url';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('avatar');
  });
});