import { Job } from 'bull';
import { EmailProcessor } from './email.processor';
import { EMAIL_JOB_SEND_VERIFICATION } from '../queue.jobs';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;

  beforeEach(() => {
    processor = new EmailProcessor();
  });

  it('processes verification email jobs', async () => {
    const job = {
      id: 'job-1',
      name: EMAIL_JOB_SEND_VERIFICATION,
      data: {
        to: 'user@example.com',
        token: 'abc123',
        userId: 'user-1',
      },
    } as Job;

    await expect(processor.handleVerification(job)).resolves.toBeUndefined();
  });

  it('rejects verification jobs with missing fields', async () => {
    const job = {
      id: 'job-2',
      name: EMAIL_JOB_SEND_VERIFICATION,
      data: { to: 'user@example.com', token: '', userId: 'user-1' },
    } as Job;

    await expect(processor.handleVerification(job)).rejects.toThrow(
      'Missing required fields for verification email job',
    );
  });
});
