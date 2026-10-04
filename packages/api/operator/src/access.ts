import type {
  AccessQueries,
  PlatformAdminRepository,
  PropertyAccessRepository,
} from "@moonship/access";
import { EmailAddress, OptimisticConcurrencyError } from "@moonship/access";

import type { Operator } from "./operator";

export interface ClaimAccessOnSignInDeps {
  propertyAccessRepository: PropertyAccessRepository;
  platformAdminRepository: PlatformAdminRepository;
  accessQueries: AccessQueries;
}

export interface ClaimAccessOnSignInResult {
  claimedMembershipIds: string[];
  claimedPlatformAdmin: boolean;
}

export async function claimAccessOnSignIn(
  deps: ClaimAccessOnSignInDeps,
  operator: Operator,
): Promise<ClaimAccessOnSignInResult> {
  const normalized = EmailAddress.parse(operator.email).value;
  const claimedMembershipIds: string[] = [];
  const claimedPlatformAdmin = await deps.platformAdminRepository.claimByEmail(
    normalized,
    operator.authUserId,
  );

  const propertyIds =
    await deps.accessQueries.listUnclaimedPropertyIdsByEmail(normalized);

  for (const propertyId of propertyIds) {
    try {
      const access =
        await deps.propertyAccessRepository.findByPropertyId(propertyId);
      if (!access) continue;
      const expectedVersion = access.version;
      const claimed = access.claimMemberships(normalized, operator.authUserId);
      if (claimed.length > 0) {
        await deps.propertyAccessRepository.save(access, expectedVersion);
        claimedMembershipIds.push(...claimed);
      }
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        console.warn(
          `[api-operator] claimAccessOnSignIn version conflict for property ${propertyId}; continuing`,
          error,
        );
        continue;
      }
      throw error;
    }
  }

  return { claimedMembershipIds, claimedPlatformAdmin };
}
