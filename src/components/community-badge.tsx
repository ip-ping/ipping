import { Badge } from "@/components/ui/badge";

/**
 * Marks a node run by a volunteer. Its results are not verified, so wherever a node is named this says so; the title
 * is what a pointer (or a screen reader) is told.
 */
export function CommunityBadge({ tier }: { tier?: string | null }) {
  if (tier !== "community") return null;
  return (
    <Badge variant="outline" title="Run by a volunteer. Its results are not verified." className="ml-1.5 align-middle">
      community
    </Badge>
  );
}
