import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BillingQueries, BillingStore, Category } from "@moonship/billing";
import { cleanName } from "@moonship/billing";

import { badRequest, conflict, notFound, toBadRequest } from "../errors";
import { propertyProcedure, router } from "../trpc";

export interface CategoryRouterDeps {
  billingStore: BillingStore;
  billingQueries: BillingQueries;
}

const nameSchema = z.string().trim().min(1).max(64);
const ownKindSchema = z.enum(["owner_expense", "income", "not_counted"]);

export function categoryRouter(deps: CategoryRouterDeps) {
  async function loadCategory(propertyId: string, id: string) {
    const categories = await deps.billingQueries.listCategories(propertyId);
    const category = categories.find((c) => c.id === id);
    if (!category) throw notFound("Category not found");
    return { category, categories };
  }

  function cleanCategoryName(
    name: string,
    categories: Category[],
    pools: { id: string; name: string }[],
    categoryId: string | null,
  ) {
    let cleaned: string;
    try {
      cleaned = cleanName(name, "Name");
    } catch (e) {
      throw toBadRequest(e, "Invalid name");
    }
    if (
      categories.some((c) => c.name === cleaned && c.id !== categoryId) ||
      pools.some((p) => p.name === cleaned)
    ) {
      throw conflict(`A category or pool named ${cleaned} already exists`);
    }
    return cleaned;
  }

  return router({
    list: propertyProcedure
      .input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const categories = await deps.billingQueries.listCategories(
          ctx.propertyId,
        );
        return input?.includeArchived
          ? categories
          : categories.filter((c) => c.archivedAt === null);
      }),

    create: propertyProcedure
      .input(z.object({ name: nameSchema, kind: ownKindSchema }))
      .mutation(async ({ ctx, input }) => {
        const [categories, pools] = await Promise.all([
          deps.billingQueries.listCategories(ctx.propertyId),
          deps.billingQueries.listPools(ctx.propertyId),
        ]);
        const category: Category = {
          id: randomUUID(),
          propertyId: ctx.propertyId,
          name: cleanCategoryName(input.name, categories, pools, null),
          kind: input.kind,
          poolId: null,
          archivedAt: null,
        };
        await deps.billingStore.saveCategory(category);
        return category;
      }),

    rename: propertyProcedure
      .input(z.object({ id: z.string().uuid(), name: nameSchema }))
      .mutation(async ({ ctx, input }) => {
        const { category, categories } = await loadCategory(
          ctx.propertyId,
          input.id,
        );
        if (category.kind === "shared_cost") {
          throw badRequest(
            "A shared-cost category takes its pool's name. Rename the pool instead.",
          );
        }
        const pools = await deps.billingQueries.listPools(ctx.propertyId);
        const renamed: Category = {
          ...category,
          name: cleanCategoryName(input.name, categories, pools, category.id),
        };
        await deps.billingStore.saveCategory(renamed);
        return renamed;
      }),

    archive: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { category } = await loadCategory(ctx.propertyId, input.id);
        if (category.kind === "shared_cost") {
          throw badRequest(
            "A shared-cost category cannot be archived. Remove the pool instead.",
          );
        }
        if (category.archivedAt !== null) return category;
        const archived: Category = { ...category, archivedAt: new Date() };
        await deps.billingStore.saveCategory(archived);
        return archived;
      }),

    unarchive: propertyProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { category } = await loadCategory(ctx.propertyId, input.id);
        if (category.archivedAt === null) return category;
        const restored: Category = { ...category, archivedAt: null };
        await deps.billingStore.saveCategory(restored);
        return restored;
      }),
  });
}
