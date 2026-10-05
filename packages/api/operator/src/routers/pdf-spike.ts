import type { PropertyQueries } from "@moonship/property";
import { renderSpikePdf } from "@moonship/statement-pdf";

import { loadProperty } from "../property-context";
import { propertyProcedure, router } from "../trpc";

export interface PdfSpikeRouterDeps {
  propertyQueries: PropertyQueries;
}

export function pdfSpikeRouter(deps: PdfSpikeRouterDeps) {
  return router({
    render: propertyProcedure.mutation(async ({ ctx }) => {
      const { property, today } = await loadProperty(
        deps.propertyQueries,
        ctx.propertyId,
      );
      const pdf = await renderSpikePdf({
        propertyName: property.name,
        date: today,
      });
      return {
        base64: pdf.toString("base64"),
        fileName: `test-${today}.pdf`,
      };
    }),
  });
}
