import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';
import { UpdateKYCStatusDto, KYCStatusEnum } from './update-kyc-status.dto';

describe('UpdateUserDto', () => {
  it('rejects preferences with invalid JSON', async () => {
    const dto = new UpdateUserDto();
    (dto as any).preferences = '{not-json';
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'preferences')).toBeDefined();
  });


  

  it('rejects oversized preferences JSON', async () => {
    const dto = new UpdateUserDto();
    (dto as any).preferences = '"' + 'a'.repeat(6000) + '"';
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'preferences')).toBeDefined();
  });

  it('rejects bio containing HTML tags', async () => {
    const dto = new UpdateUserDto();
    (dto as any).bio = 'hello <script>alert(1)</script>';
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'bio')).toBeDefined();
  });

  it('accepts valid bio', async () => {
    const dto = new UpdateUserDto();
    (dto as any).bio = 'just a normal bio';
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'bio')).toBeUndefined();
  });

  it('rejects name with HTML tags', async () => {
    const dto = new UpdateUserDto();
    (dto as any).name = '<b>Jane</b>';
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'name')).toBeDefined();
  });

  it('accepts valid name', async () => {
    const dto = new UpdateUserDto();
    (dto as any).name = 'Jane Doe';
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'name')).toBeUndefined();
  });

  it('rejects socialLinks with invalid JSON', async () => {
    const dto = new UpdateUserDto();
    (dto as any).socialLinks = 'plain string';
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'socialLinks')).toBeDefined();
  });

  it('rejects future date_of_birth', async () => {
    const dto = new UpdateUserDto();
    dto.date_of_birth = '2080-01-01';
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'date_of_birth')).toBeDefined();
  });

  it('rejects date_of_birth for users under 18', async () => {
    const dto = new UpdateUserDto();
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() - 10);
    dto.date_of_birth = futureDate.toISOString();
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'date_of_birth')).toBeDefined();
  });

  it('accepts valid date_of_birth for adult users', async () => {
    const dto = new UpdateUserDto();
    dto.date_of_birth = '1995-05-15';
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'date_of_birth')).toBeUndefined();
  });
});

describe('UpdateKYCStatusDto', () => {
  it('accepts VERIFIED without reason', async () => {
    const dto = new UpdateKYCStatusDto();
    dto.status = KYCStatusEnum.VERIFIED;
    const errors = await validate(dto);
    expect(errors.map((e: any) => e.property)).not.toContain('reason');
  });

  it('rejects REJECTED with empty reason', async () => {
    const dto = new UpdateKYCStatusDto();
    dto.status = KYCStatusEnum.REJECTED;
    const errors = await validate(dto);
    expect(errors.find((e: any) => e.property === 'reason')).toBeDefined();
  });

  it('accepts REJECTED with non-empty reason', async () => {
    const dto = new UpdateKYCStatusDto();
    dto.status = KYCStatusEnum.REJECTED;
    dto.reason = 'Documentation mismatch';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts PENDING with optional reason', async () => {
    const dto = new UpdateKYCStatusDto();
    dto.status = KYCStatusEnum.PENDING;
    dto.reason = 'awaiting more docs';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
