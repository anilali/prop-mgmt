import { relations } from "drizzle-orm";
import { boolean, index, pgSchema, text } from "drizzle-orm/pg-core";

import { authTimestamp, authTimestampNow } from "../auth-timestamp";

export const authOperatorSchema = pgSchema("auth_operator");

export const user = authOperatorSchema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: authTimestampNow("created_at").notNull(),
  updatedAt: authTimestampNow("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date().toISOString())
    .notNull(),
});

export const session = authOperatorSchema.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: authTimestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: authTimestampNow("created_at").notNull(),
    updatedAt: authTimestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date().toISOString())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("auth_operator_session_userId_idx").on(table.userId)],
);

export const account = authOperatorSchema.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: authTimestamp("access_token_expires_at"),
    refreshTokenExpiresAt: authTimestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: authTimestampNow("created_at").notNull(),
    updatedAt: authTimestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date().toISOString())
      .notNull(),
  },
  (table) => [index("auth_operator_account_userId_idx").on(table.userId)],
);

export const verification = authOperatorSchema.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: authTimestamp("expires_at").notNull(),
    createdAt: authTimestampNow("created_at").notNull(),
    updatedAt: authTimestampNow("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date().toISOString())
      .notNull(),
  },
  (table) => [
    index("auth_operator_verification_identifier_idx").on(table.identifier),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
