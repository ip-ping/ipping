import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="space-y-4 py-12 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Ping from many places at once</h1>
      <p className="mx-auto max-w-xl text-muted-foreground">
        Enter an IP address, hostname or URL and see how it answers from every node.
      </p>
      <Button render={<Link href="/nodes" />}>See the nodes</Button>
    </div>
  );
}
