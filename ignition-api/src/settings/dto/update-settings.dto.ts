import { IsInt, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class UpdateSettingsDto {
  /**
   * Access token TTL in seconds (minimum 5 minutes = 300s, maximum 24 hours = 86400s)
   */
  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(86400)
  sessionAccessTtlSeconds?: number;

  /**
   * Absolute session TTL in seconds (minimum 1 hour = 3600s, maximum 30 days = 2592000s)
   */
  @IsOptional()
  @IsInt()
  @Min(3600)
  @Max(2592000)
  sessionTtlSeconds?: number;

  /**
   * Idle timeout in seconds - session expires if not updated within this time
   * (minimum 5 minutes = 300s, maximum 7 days = 604800s)
   */
  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(604800)
  sessionIdleTimeoutSeconds?: number;

  /**
   * Whether to enable session persistence (extend session on activity)
   */
  @IsOptional()
  @IsBoolean()
  sessionPersistenceEnabled?: boolean;

  /**
   * Max address generation requests per IP within the throttle TTL.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  addressGenerationThrottleLimit?: number;

  /**
   * Address-generation throttle window in seconds.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  addressGenerationThrottleTtlSeconds?: number;

  /**
   * Percent of the limit that triggers a warning alert.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  addressGenerationThrottleAlertThresholdPercent?: number;

  /**
   * Consecutive breached-window length in minutes before a sustained breach alert fires.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  addressGenerationThrottleSustainedBreachMinutes?: number;

  /**
   * Unique IPs that must hit the throttle within one minute before a traffic alert fires.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  addressGenerationThrottleUniqueIpsThreshold?: number;

  /**
   * Cooldown period for repeated alerts, in minutes.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  addressGenerationThrottleAlertCooldownMinutes?: number;
}