export function WorkspaceSkeleton() {
  return (
    <div className="flex h-dvh" aria-busy="true" aria-label="Loading workspace">
      <div className="hidden w-64 shrink-0 space-y-2 border-r p-3 lg:block">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-7 w-full animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="hidden w-80 shrink-0 space-y-2 border-r p-3 lg:block">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-14 w-full animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="flex-1" />
    </div>
  );
}
