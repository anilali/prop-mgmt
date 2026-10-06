"use client";

import { useState } from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";

import { Button } from "@moonship/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@moonship/ui/dialog";
import { EmptyState } from "@moonship/ui/empty-state";
import { List, ListHeader, ListRow } from "@moonship/ui/list";

import { useTRPC } from "~/trpc/react";
import { PageTopBar } from "../../../_components/page-top-bar";
import { formatStreet } from "../../../setup/_components/address-fields";
import { RegisterPropertyForm } from "./register-property-form";

const COLUMNS = "minmax(0,1fr) minmax(0,1.3fr) 14px";

export function PropertiesPageContent() {
  const trpc = useTRPC();
  const { data: properties } = useSuspenseQuery(
    trpc.property.list.queryOptions(),
  );
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageTopBar
        crumbs={[{ label: "Properties" }]}
        actions={
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <Plus />
            Register property
          </Button>
        }
      />
      <div className="nav:px-6 nav:pt-[22px] nav:pb-12 max-w-[880px] px-4 pt-[18px] pb-10">
        {properties.length === 0 ? (
          <EmptyState headline="No properties yet" />
        ) : (
          <List className="animate-rise">
            <ListHeader columns={COLUMNS}>
              <span>Name</span>
              <span>Address</span>
              <span />
            </ListHeader>
            {properties.map((property) => (
              <ListRow key={property.id} columns={COLUMNS} asChild>
                <Link href={`/platform/properties/${property.id}`}>
                  <span className="truncate font-medium">{property.name}</span>
                  <span className="text-fg-2 truncate">
                    {formatStreet(property.address)}, {property.address.city},{" "}
                    {property.address.state}
                  </span>
                  <ChevronRight className="text-fg-3 size-3.5" />
                </Link>
              </ListRow>
            ))}
          </List>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Register property</DialogTitle>
          </DialogHeader>
          {open ? <RegisterPropertyForm onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
