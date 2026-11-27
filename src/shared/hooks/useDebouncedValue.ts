import { useEffect, useState } from "react";

/** Delay expensive client-side filtering until the user pauses typing. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => setDebouncedValue(value), delay);
        return () => window.clearTimeout(timeoutId);
    }, [value, delay]);

    return debouncedValue;
}
