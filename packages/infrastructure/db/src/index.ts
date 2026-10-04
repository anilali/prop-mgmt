export { createDb } from "./client";
export type { DatabaseClient } from "./client";

export { eq } from "drizzle-orm";

export { PGPropertyAccessRepository } from "./repositories/access/property-access-repository";
export { PGPlatformAdminRepository } from "./repositories/access/platform-admin-repository";
export { PGPropertyRepository } from "./repositories/property/property-repository";
export { PGUnitRepository } from "./repositories/property/unit-repository";
export { PGTenantRepository } from "./repositories/tenant-mgmt/tenant-repository";
export { PGLeaseRepository } from "./repositories/lease-mgmt/lease-repository";

export { PGAccessQueries } from "./queries/access/access-queries";
export { PGPropertyQueries } from "./queries/property/property-queries";
export { PGUnitQueries } from "./queries/property/unit-queries";
export { PGTenantQueries } from "./queries/tenant-mgmt/tenant-queries";
export { PGLeaseQueries } from "./queries/lease-mgmt/lease-queries";
