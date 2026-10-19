import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/** Guards the no-secret-logging rule: nothing in api-keys/ or campaigns/ may log credentials or promo codes. */
function sources(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));
}

describe('secret hygiene', () => {
  it('api-key code never logs the Authorization header or bearer token', () => {
    for (const source of sources(__dirname)) {
      expect(source).not.toMatch(/logger\.\w+\([^)]*(authorization|bearer)/i);
    }
  });

  it('campaign response DTOs do not expose a promotional code', () => {
    const dto = readFileSync(join(__dirname, '../campaigns/dto/browse-campaigns.dto.ts'), 'utf8');
    expect(dto).not.toMatch(/^\s*(readonly\s+)?(code|discountCode|promoCode)\??\s*[:!]/m);
  });
});
