# Operator access

The operator portal moves from one property to many. This doc covers who can use the portal, what they can do on each property, and the domain changes that need.

Google sign-in does not give access. A signed-in operator with no platform admin record and no active membership sees the no-access page and can only sign out.

## Glossary

- **Operator.** A person signed in to the operator portal with Google. Identified by `authUserId` and email.
- **Platform admin.** An operator who can register properties and manage access on any property. Cannot see operational data (tenants, leases, units, property settings).
- **Membership.** An operator's access to one property. Has a role and a status.
- **Role.** `admin` or `staff`. Both can operate the property. Only `admin` can manage access to it.
- **Property admin / property staff.** An operator with an active membership on a property, with role `admin` or `staff`.
- **Grant.** Give an email a membership on a property.
- **Revoke.** End a membership. The membership stays, with status `revoked`.
- **Claim.** Bind a membership granted to an email to the `authUserId` of the operator who signed in with that email.
- **Current context.** Which mode the operator is working in: platform mode, with no property, or one operable property. Resolved on every request from a session cookie and available as request context.

## Context map

```text
auth_operator (Better Auth)
        |
        |  anti-corruption layer: session -> Operator { authUserId, email }
        v
     Access  ----propertyId---->  Property
        |
        |  policies: canOperate, canManageAccess, isPlatformAdmin
        v
  API layer (packages/api/operator)
        |
        v
  Property, TenantMgmt, LeaseMgmt (scoped by propertyId)
```

- **Access** is a new bounded context in `packages/contexts/access`, persisted in the `access` Postgres schema. It owns platform admins and memberships. It refers to properties only by `propertyId`.
- **auth_operator** (Better Auth) is upstream and stays as is. One function in the API layer turns a Better Auth session into an `Operator`. Nothing in `packages/contexts` sees a Better Auth type. A Better Auth session-create hook in the portal calls `claimAccessOnSignIn(operator)` in the API package. That function is not a client-callable procedure.
- **Property, TenantMgmt, LeaseMgmt** do not know about access. The API layer checks Access policies before it calls them. Operate calls get `propertyId` from request context. Access calls get `propertyId` from the input and check `canManageAccess`.
- `StaffMember` and its events leave the Property context.

## Access context

### Value objects

- **EmailAddress.** Trimmed and lowercased on creation. Two emails are equal when the normalized values are equal. All matching between grants and Google accounts uses this.
- **Role.** `admin` | `staff`.
- **MembershipStatus.** `active` | `revoked`.

### PlatformAdmin (entity, no commands)

Fields: `email` (unique), `authUserId` (null until claimed).

- Records are inserted directly in the DB. The application has no command to create or remove one, and no seed script.
- On sign-in, a claim binds `authUserId` only if it is still null, in one conditional update. After that, the operator is a platform admin only if their `authUserId` matches.
- A platform admin has no access to any property's operational data through being a platform admin. To operate a property, they need a membership like anyone else.

### PropertyAccess (aggregate)

One per property. Aggregate id is the `propertyId`. Holds every membership on that property.

Membership fields: `membershipId`, `email`, `authUserId` (null until claimed), `role`, `status`.

Invariants:

1. At most one membership per email on a property, active or revoked.
2. A property with at least one active admin can never drop to zero active admins. Revoking or demoting the last active admin is rejected, no matter who asks. A platform admin who wants to remove the last admin grants another admin first.
3. A new property has no `PropertyAccess` until the first grant. The first grant must have role `admin`. More generally, a grant or reactivation with role `staff` is rejected while the property has no active admin. Invariant 2 then always holds. Registering a property does not create one.
4. Once claimed, a membership's `authUserId` never changes.

The repository stops two concurrent changes from both passing the invariant 2 check with an optimistic version on the aggregate. The version check is a single conditional update in the same transaction as the membership writes. A clash rejects with a conflict and the caller refetches. No retry.

### Commands and events

| Command | Rules | Event |
|---|---|---|
| `GrantMembership(propertyId, email, role)` | Rejected if the email has an active membership. If it has a revoked one, use `ReactivateMembership`. | `MembershipGranted` |
| `ReactivateMembership(propertyId, membershipId, role)` | Membership must be revoked. Keeps the same `membershipId` and `authUserId`. | `MembershipReactivated` |
| `ChangeMembershipRole(propertyId, membershipId, role)` | Membership must be active. Checks invariant 2. No-op if the role is unchanged. | `MembershipRoleChanged` |
| `RevokeMembership(propertyId, membershipId)` | Membership must be active. Checks invariant 2. | `MembershipRevoked` |
| `claimAccessOnSignIn(operator)` | Application service, not an aggregate command. Finds unclaimed memberships by email, loads each `PropertyAccess`, and claims. Also claims a matching unclaimed platform admin row. Invoked only on sign-in. | `MembershipClaimed` (one per membership) |

Every event carries `propertyId` as `aggregateId` and `membershipId` in its payload. Grant, reactivate, role change, and revoke events also carry the acting operator's `authUserId`.

The email on a membership cannot be edited. To move access to a different email, revoke and grant again.

The member list includes revoked memberships. The API layer's grant procedure calls `GrantMembership` or `ReactivateMembership`. The client does not choose.

### Policies

These are pure functions in the Access context. The API layer calls them. tRPC middleware only wires them in.

- `isPlatformAdmin(operator)`: a claimed platform admin record matches the operator's `authUserId`.
- `canOperate(operator, propertyId)`: the operator has an active, claimed membership on the property, with any role.
- `canManageAccess(operator, propertyId)`: `isPlatformAdmin(operator)`, or the operator has an active, claimed `admin` membership on the property.
- `canRegisterProperty(operator)`: `isPlatformAdmin(operator)`.

Property staff can operate but cannot manage access. A platform admin can manage access on every property but cannot operate one without a membership.

### Identity and claiming

A grant names an email. The person does not need to have signed in yet.

On every sign-in, a Better Auth session-create hook in the portal calls `claimAccessOnSignIn(operator)` in the API package. That function is not exposed to the client. It claims matching unclaimed memberships and any matching unclaimed platform admin record. Matching is by `EmailAddress`. Later requests only read. After claiming, access checks use `authUserId`, not email. This means:

- Signing in with the wrong Google account gives a signed-in operator with no access.
- If a Google account's email is later used by a different Google account, that account does not inherit access already claimed by the first.
- Losing a Google account is rare and handled manually. There is no self-serve recovery.
- Claiming runs only at sign-in. A grant made while an operator is signed in takes effect after they sign out and sign in again. That includes a platform admin who registers a property and grants their own email. The grant UI should say this. This asymmetry is intentional. A slow grant and a fast revoke fail in the safe direction.
- Revokes and role changes on claimed memberships take effect on the next request. Access checks read membership status and role on every request, not from the session.
- No email verification step is needed. Google sign-in is the only login path.
- If claiming throws, sign-in still succeeds and the operator lands on no-access. The error is logged. Claiming never fails sign-in. Access fails closed instead.

## Property scoping in other contexts

Today only `Unit` has a `propertyId`. `Tenant` and `Lease` are global. Multi-property needs them scoped.

Every property-scoped read and write takes `propertyId` from request context. That includes `list`, `getById`, and `findById`. If the id exists but belongs to another property, the result is not found. The client does not pass `propertyId` on operate calls.

### TenantMgmt

- `Tenant` gets a required `propertyId`, set on creation and never changed. A tenant belongs to exactly one property.
- `TenantCreated` carries `propertyId`.
- Tenant queries and the tenant repository take a `propertyId`. `getById(propertyId, id)` and `findById(propertyId, id)` return nothing when the tenant is on a different property.

### LeaseMgmt

- `Lease` gets a required `propertyId`, set on creation and never changed.
- A lease's unit and tenant must belong to the request's `propertyId`. This spans aggregates in two contexts, so the application service creating the lease checks it before calling `Lease.create`.
- `LeaseCreated` carries `propertyId`.
- Lease queries and the lease repository take a `propertyId`. `getById(propertyId, id)` and `findById(propertyId, id)` return nothing when the lease is on a different property.

### Property

- `Unit` already has `propertyId`. Unit queries and the unit repository take a `propertyId`, including `list`, `getById`, and `findById`. Utility-sharing validation uses that property's units only.
- Property operate reads (`get`, update metadata) use the `propertyId` on request context. `findSingleton` goes away.
- `PropertyQueries.list()` returns every property. The API allows it only when `isPlatformAdmin(operator)`.
- The switcher is a separate list. The API loads the operator's operable memberships, then property names for those ids. It is not `PropertyQueries.list()`.
- `RegisterProperty` is allowed only when `canRegisterProperty(operator)`. Registering a property does not grant the platform admin a membership and does not create a `PropertyAccess`. If they want to operate it, they grant their own email and sign in again. The first grant creates the aggregate.

## Application behavior

Everything below is application and UI behavior in the operator portal. None of it is domain logic.

### Current context

The current context is stored in a portal-owned httpOnly cookie named `op_ctx`, separate from the Better Auth session cookie. Its value is platform mode or one property id. It is resolved on every request. The API layer and the UI read it from request context. It is not how operate screens are routed.

The portal writes the cookie only through the explicit switch action. Pages and API calls resolve the context on every request and never write the cookie. A stale or tampered value does no harm because it is checked against the policies every time. The resolver and loader live in `packages/api/operator`. The portal's server render and the tRPC route both call them.

The context is either platform mode, with no property, or one operable property, with a `propertyId`.

On each request:

1. If the cookie names a property and `canOperate(operator, propertyId)` is true, use that property.
2. If the cookie says platform mode and `isPlatformAdmin(operator)` is true, use platform mode.
3. Otherwise fall back to the first operable property by name. If there is none and the operator is a platform admin, use platform mode.
4. If none of those apply, show the no-access page.

Operate APIs (tenants, leases, units, property settings) take `propertyId` from request context. The client does not pass it. Access APIs take `propertyId` as input and check `canManageAccess`. Grant takes an email and a role: new email grants, revoked email reactivates with that role, active email is rejected. There is no reactivate procedure. Change role and revoke take a `membershipId`. Registering a property uses no `propertyId` and checks `canRegisterProperty`.

Operate screens are at `/setup`, `/tenants`, `/leases`, and `/leases/[accountId]`. The v1 engineering spec adds `/home`, `/rent`, `/transactions`, and `/reconciliation` in later milestones.

### Platform mode

Shows properties and access management only. No tenants, leases, units, or property settings, even if the operator also has memberships. To see that data they switch into a property. The sidebar changes in platform mode to match.

Platform admins use their own interface, not the property access screen. A property list page drills down into a members page. That page may put the property id in the URL. The cookie stays on platform mode. That id is not current context.

Platform admins can register properties and grant, change, and revoke memberships on any property.

### Property mode

The existing operator screens, scoped to the `propertyId` on request context. The access management screen is shown when the operator's own active membership on the property has role `admin`. Being a platform admin does not count in property mode.

### Sidebar

The sidebar search box is removed. Its spot holds the context control. The sidebar shows the operator's role in the current context, so the label changes when they switch.

The switcher lists only properties the operator can operate, plus a Platform entry when they are a platform admin. That list comes from Access memberships and property names, not from the platform property list.

- Platform admin with no memberships: no switcher.
- One membership, not a platform admin: the property name, not a switcher.
- Several memberships: a switcher, sorted alphabetically by property name.
- Platform admin with memberships: the same switcher, plus a Platform entry.

## Persistence

- New `access` schema with platform admins, memberships, and a per-property row that holds the `PropertyAccess` version. That row is inserted on the first grant, not when the property is registered. Platform admin email is unique. Memberships are unique on property plus normalized email, stored lowercased.
- `tenant_mgmt.tenants` and `lease_mgmt.leases` get a non-null `property_id`. Existing tenant and lease rows are dropped, not migrated. This loss is accepted.
- `property.staff_members` is dropped, along with the `StaffMember` aggregate, its repository, queries, and events. Existing staff rows are not migrated. This loss is accepted. After deploy, insert a platform admin row and grant memberships again.
