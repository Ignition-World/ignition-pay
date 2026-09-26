import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import {
  BODY_SIZE_LIMIT_METADATA_KEY,
  MAX_BODY_SIZE_LIMIT_CEILING,
} from '../payload-limits';

/**
 * Issue #622 — raise (or lower) the request body limit for a single route.
 *
 * The global limits are applied in `main.ts` on `express.json()` /
 * `express.urlencoded()`. A handler that legitimately needs a larger body —
 * a file upload endpoint, for example — opts in here instead of loosening the
 * limit for the whole API.
 *
 * The value is clamped to {@link MAX_BODY_SIZE_LIMIT_CEILING}, so no route can
 * opt out of body limiting entirely.
 *
 * @example
 * ```ts
 * @Post('kyc/documents')
 * @MaxBodySize('10mb')       // 10 MB ceiling
 * uploadDocument(@Body() dto: UploadDocumentDto) { ... }
 * ```
 *
 * Applies to both JSON and URL-encoded bodies. A value set here takes
 * precedence over the `MAX_JSON_BODY_BYTES` / `MAX_URLENCODED_BODY_BYTES`
 * environment overrides, which only supply the default for routes without a
 * decorator.
 */
export const MaxBodySize = (limit: string | number): CustomDecorator<string> =>
  SetMetadata(BODY_SIZE_LIMIT_METADATA_KEY, limit);
