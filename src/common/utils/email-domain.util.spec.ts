import { domainAcceptsMail } from './email-domain.util';

const mockResolveMx = jest.fn();

jest.mock('node:dns/promises', () => ({
  resolveMx: (domain: string) => mockResolveMx(domain),
}));

describe('domainAcceptsMail', () => {
  beforeEach(() => {
    mockResolveMx.mockReset();
  });

  it('returns false for a malformed email with no domain part', async () => {
    const result = await domainAcceptsMail('not-an-email');

    expect(result).toBe(false);
    expect(mockResolveMx).not.toHaveBeenCalled();
  });

  it('returns true when the domain has MX records', async () => {
    mockResolveMx.mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }]);

    const result = await domainAcceptsMail('jane@example.com');

    expect(mockResolveMx).toHaveBeenCalledWith('example.com');
    expect(result).toBe(true);
  });

  it('returns false when the domain does not exist (ENOTFOUND)', async () => {
    mockResolveMx.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }));

    const result = await domainAcceptsMail('jane@123.com');

    expect(result).toBe(false);
  });

  it('returns false when the domain exists but has no MX records (ENODATA)', async () => {
    mockResolveMx.mockRejectedValue(Object.assign(new Error('no data'), { code: 'ENODATA' }));

    const result = await domainAcceptsMail('jane@no-mail-domain.com');

    expect(result).toBe(false);
  });

  it('fails open (returns true) on an unexpected resolver error', async () => {
    mockResolveMx.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }));

    const result = await domainAcceptsMail('jane@example.com');

    expect(result).toBe(true);
  });
});
