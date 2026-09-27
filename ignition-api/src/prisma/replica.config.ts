/**
 * Read-replica connection resolution (issue #599).
 *
 * Backward compatibility with the existing deployment is the hard requirement
 * here: every current environment configures exactly one variable,
 * `DATABASE_URL`. The replica layer is therefore opt-in and degrades to
 * "primary only" when `DATABASE_REPLICA_URL` is absent, so a single-database
 * deployment keeps booting unchanged.
 *
 *   DATABASE_PRIMARY_URL   optional explicit primary; falls back to DATABASE_URL
 *   DATABASE_REPLICA_URL   optional read replica; absent => replicas disabled
 *
 * Why a second PrismaClient instead of Prisma's own replica configuration
 * ------------------------------------------------------------------------
 * With the pinned `@prisma/client` 6.19.x:
 *
 *   - The constructor `datasources` override only accepts `url`. There is no
 *     replica key to set.
 *   - First-class read routing (`$replica()`, automatic routing of `findMany`
 *     to a replica while writes go to the primary) lives in the separate
 *     `@prisma/extension-read-replicas` package, which this repository does
 *     not depend on and which this change does not add.
 *   - `directUrl` in `schema.prisma` is unrelated to read replicas; it is the
 *     "bypass the connection pooler for migrations" URL, and using it for
 *     reads would send reads to the primary anyway.
 *
 * So the replica is reached by pointing a second `PrismaClient` at the replica
 * URL and routing reads through `ReadReplicaRouter` (read-replica.router.ts).
 * Swapping in the official extension later is a change local to PrismaService.
 */
export interface ReplicaConfig {
  /** Primary (writable) connection string; '' when nothing is configured. */
  primaryUrl: string;
  /** Read-replica connection string, or undefined when replicas are disabled. */
  replicaUrl?: string;
  /** True when a replica client should be opened. */
  replicaEnabled: boolean;
}

/** Resolve the primary/replica connection strings from an environment bag. */
export function resolveReplicaConfig(
  env: NodeJS.ProcessEnv = process.env,
): ReplicaConfig {
  const primaryUrl =
    (env.DATABASE_PRIMARY_URL ?? '').trim() || (env.DATABASE_URL ?? '');

  const configuredReplica = (env.DATABASE_REPLICA_URL ?? '').trim();

  // Pointing the "replica" at the primary would double the primary's
  // connection pool for zero read-capacity gain, so treat it as "not
  // configured" rather than silently opening a second writer-facing client.
  const replicaUrl =
    configuredReplica.length > 0 && configuredReplica !== primaryUrl
      ? configuredReplica
      : undefined;

  return { primaryUrl, replicaUrl, replicaEnabled: replicaUrl !== undefined };
}
