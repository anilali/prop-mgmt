"use client";

import { useState } from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";

import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { EmptyState } from "@moonship/ui/empty-state";
import { PageHeader } from "@moonship/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moonship/ui/table";

import { useTRPC } from "~/trpc/react";
import { RegisterPropertyForm } from "./register-property-form";

export function PropertiesPageContent() {
  const trpc = useTRPC();
  const { data: properties } = useSuspenseQuery(
    trpc.property.list.queryOptions(),
  );
  const [open, setOpen] = useState(false);
  const sorted = [...properties].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Properties"
        description="Register properties and manage their members."
        action={
          <Button type="button" onClick={() => setOpen(true)}>
            Register property
          </Button>
        }
      />
      {sorted.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          headline="No properties"
          description="Register your first property to get started."
          className="rounded-lg border border-dashed py-16"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((property) => (
              <TableRow key={property.id}>
                <TableCell className="font-medium">
                  <Link
                    className="underline underline-offset-4"
                    href={`/platform/properties/${property.id}`}
                  >
                    {property.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href={`/platform/properties/${property.id}`}>
                      Members
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register property</DialogTitle>
          </DialogHeader>
          <RegisterPropertyForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
