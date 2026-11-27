import type { Transition, Variants } from 'framer-motion';

export const MOTION_EASE = {
  enter: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  standard: [0.2, 0, 0, 1] as const,
};

export const MOTION_DURATION = {
  micro: 0.14,
  exit: 0.13,
  page: 0.18,
  modal: 0.2,
  collapse: 0.2,
} as const;

export const MOTION_SPRING = {
  indicator: {
    type: 'spring' as const,
    stiffness: 460,
    damping: 36,
    mass: 0.8,
  },
  subtle: {
    type: 'spring' as const,
    stiffness: 420,
    damping: 34,
    mass: 0.85,
  },
} satisfies Record<string, Transition>;

export const PAGE_TRANSITION: Transition = {
  duration: MOTION_DURATION.page,
  ease: MOTION_EASE.enter,
};

export const EXIT_TRANSITION: Transition = {
  duration: MOTION_DURATION.exit,
  ease: MOTION_EASE.exit,
};

export const MODAL_BACKDROP_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: MOTION_DURATION.micro, ease: MOTION_EASE.enter },
  },
  exit: {
    opacity: 0,
    transition: { duration: MOTION_DURATION.exit, ease: MOTION_EASE.exit },
  },
};

export const MODAL_PANEL_VARIANTS: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: MOTION_DURATION.modal, ease: MOTION_EASE.enter },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.985,
    transition: { duration: MOTION_DURATION.exit, ease: MOTION_EASE.exit },
  },
};

export const SHEET_PANEL_VARIANTS: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.modal, ease: MOTION_EASE.enter },
  },
  exit: {
    opacity: 0,
    y: 16,
    transition: { duration: MOTION_DURATION.exit, ease: MOTION_EASE.exit },
  },
};

export const COLLAPSE_PANEL_VARIANTS: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: {
    opacity: 1,
    height: 'auto',
    transition: {
      height: { duration: MOTION_DURATION.collapse, ease: MOTION_EASE.enter },
      opacity: { duration: MOTION_DURATION.micro, ease: MOTION_EASE.enter },
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: {
      height: { duration: MOTION_DURATION.exit, ease: MOTION_EASE.exit },
      opacity: { duration: 0.1, ease: MOTION_EASE.exit },
    },
  },
};

export const ADMIN_TAB_VARIANTS: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.page, ease: MOTION_EASE.enter },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: MOTION_DURATION.exit, ease: MOTION_EASE.exit },
  },
};

export type ExecutorPageOrderKey =
  | 'home'
  | 'jobs'
  | 'history'
  | 'profile'
  | 'task-detail'
  | 'gps'
  | 'worksheet'
  | 'completion';

const PRIMARY_TAB_INDEX: Partial<Record<ExecutorPageOrderKey, number>> = {
  home: 0,
  jobs: 1,
  history: 2,
  profile: 3,
};

const WORKFLOW_DEPTH: Partial<Record<ExecutorPageOrderKey, number>> = {
  'task-detail': 1,
  gps: 2,
  worksheet: 3,
  completion: 4,
};

/**
 * Returns subtle horizontal transition direction (-1 = left/back, 0 = neutral, 1 = right/forward)
 * for technician page transitions without exaggerated travel distances.
 */
export function getExecutorPageDirection(
  previousPage: ExecutorPageOrderKey | null,
  nextPage: ExecutorPageOrderKey
): -1 | 0 | 1 {
  if (!previousPage || previousPage === nextPage) {
    return 0;
  }

  const prevTab = PRIMARY_TAB_INDEX[previousPage];
  const nextTab = PRIMARY_TAB_INDEX[nextPage];

  if (prevTab !== undefined && nextTab !== undefined) {
    return nextTab > prevTab ? 1 : -1;
  }

  const prevDepth = WORKFLOW_DEPTH[previousPage] ?? 0;
  const nextDepth = WORKFLOW_DEPTH[nextPage] ?? 0;

  if (nextDepth > prevDepth) return 1;
  if (nextDepth < prevDepth) return -1;
  return 0;
}

export function createExecutorPageVariants(direction: -1 | 0 | 1): {
  initial: { opacity: number; x: number; y: number };
  animate: { opacity: number; x: number; y: number; transition: Transition };
  exit: { opacity: number; x: number; y: number; transition: Transition };
} {
  const enterOffset = direction === 0 ? 0 : direction * 10;
  const exitOffset = direction === 0 ? 0 : direction * -8;

  return {
    initial: { opacity: 0, x: enterOffset, y: direction === 0 ? 6 : 0 },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: MOTION_DURATION.page, ease: MOTION_EASE.enter },
    },
    exit: {
      opacity: 0,
      x: exitOffset,
      y: direction === 0 ? -4 : 0,
      transition: { duration: MOTION_DURATION.exit, ease: MOTION_EASE.exit },
    },
  };
}

/**
 * Computes a bounded list stagger delay so long lists stay immediate.
 */
export function getStaggerDelay(index: number, stepSeconds = 0.022, maxItems = 6): number {
  if (index <= 0) return 0;
  const clamped = Math.min(index, maxItems);
  return Number((clamped * stepSeconds).toFixed(3));
}

/**
 * Determines subtle horizontal slide direction (-1 = left, 0 = neutral, 1 = right)
 * for segmented tab switches based on item ordering.
 */
export function getSegmentDirection(
  order: readonly string[],
  previousId: string | null | undefined,
  nextId: string
): -1 | 0 | 1 {
  if (!previousId || previousId === nextId) return 0;
  const prevIndex = order.indexOf(previousId);
  const nextIndex = order.indexOf(nextId);
  if (prevIndex === -1 || nextIndex === -1 || prevIndex === nextIndex) return 0;
  return nextIndex > prevIndex ? 1 : -1;
}

/**
 * Returns calm directional horizontal crossfade variants for segmented tab content.
 */
export function createTabContentVariants(direction: -1 | 0 | 1): {
  initial: { opacity: number; x: number; y: number };
  animate: { opacity: number; x: number; y: number; transition: Transition };
  exit: { opacity: number; x: number; y: number; transition: Transition };
} {
  const enterOffset = direction === 0 ? 0 : direction * 12;
  const exitOffset = direction === 0 ? 0 : direction * -10;

  return {
    initial: { opacity: 0, x: enterOffset, y: direction === 0 ? 4 : 0 },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: 0.16, ease: MOTION_EASE.enter },
    },
    exit: {
      opacity: 0,
      x: exitOffset,
      y: direction === 0 ? -3 : 0,
      transition: { duration: 0.11, ease: MOTION_EASE.exit },
    },
  };
}

