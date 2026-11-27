import { cn } from "@/shared/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            aria-hidden="true"
            className={cn("animate-pulse rounded-md bg-[var(--bg-skeleton)]", className)}
            {...props}
        />
    )
}

export { Skeleton }
