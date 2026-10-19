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

  it('discards job and throws when FROM address is misconfigured / invalid (Issue #810)', async () => {
    const discardMock = jest.fn();
    const job = {
      id: 'job-3',
      name: EMAIL_JOB_SEND_VERIFICATION,
      data: {
        to: 'user@example.com',
        token: 'abc123',
        userId: 'user-1',
        from: 'invalid-from-address',
      },
      discard: discardMock,
    } as unknown as Job;

    await expect(processor.handleVerification(job)).rejects.toThrow(
      'Misconfigured or invalid FROM address: "invalid-from-address"',
    );
    expect(discardMock).toHaveBeenCalledTimes(1);
  });

  it('processes send_email job and discards on invalid FROM address', async () => {
    const discardMock = jest.fn();
    const badJob = {
      id: 'job-4',
      name: 'send_email',
      data: {
        to: 'user@example.com',
        subject: 'Notification',
        from: 'bad@smtp@host',
      },
      discard: discardMock,
    } as unknown as Job;

    await expect(processor.handleSendEmail(badJob)).rejects.toThrow(
      'Misconfigured or invalid FROM address',
    );
    expect(discardMock).toHaveBeenCalledTimes(1);

    const goodJob = {
      id: 'job-5',
      name: 'send_email',
      data: {
        to: 'user@example.com',
        subject: 'Notification',
        from: 'sender@example.com',
      },
      discard: jest.fn(),
    } as unknown as Job;

    await expect(processor.handleSendEmail(goodJob)).resolves.toBeUndefined();
  });
});
