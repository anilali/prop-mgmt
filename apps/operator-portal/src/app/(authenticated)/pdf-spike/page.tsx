import { PageHeader } from "@moonship/ui/page-header";

import { requirePropertyContext } from "../_lib/require-operator-context";
import { TestPdfButton } from "./_components/test-pdf-button";

export default async function PdfSpikePage() {
  await requirePropertyContext();

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="PDF test"
        description="Renders a one-page PDF on the server and downloads it."
        action={<TestPdfButton />}
      />
    </div>
  );
}
