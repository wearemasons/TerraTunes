import { Alert, AlertDescription, AlertTitle } from "@my-better-t-app/ui/components/alert";
import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@my-better-t-app/ui/components/empty";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function PageError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="sr-only">Error</h1>
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>That didn't load</AlertTitle>
        <AlertDescription>
          <p>{message}</p>
          <p>
            <Link to="/">Back to the jukebox</Link>
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function PageNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            <h1 className="text-lg">Nothing playing here</h1>
          </EmptyTitle>
          <EmptyDescription>This page or track doesn't exist.</EmptyDescription>
        </EmptyHeader>
        <Link to="/" className={buttonVariants({ variant: "default" })}>
          Back to the jukebox
        </Link>
      </Empty>
    </div>
  );
}
