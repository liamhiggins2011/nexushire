import { Skeleton } from "@/components/ui/skeleton";

export default function OutreachLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b h-14" />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-6 space-y-3">
              <Skeleton className="h-5 w-60" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
