import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide',
  {
    variants: {
      variant: {
        default: 'bg-[hsl(var(--badge-default-bg))] text-[hsl(var(--badge-default-fg))]',
        upcoming: 'bg-[hsl(var(--badge-upcoming-bg))] text-[hsl(var(--badge-upcoming-fg))]',
        ongoing: 'bg-[hsl(var(--badge-ongoing-bg))] text-[hsl(var(--badge-ongoing-fg))]',
        paused: 'bg-[hsl(var(--badge-paused-bg))] text-[hsl(var(--badge-paused-fg))]',
        ended: 'bg-[hsl(var(--badge-ended-bg))] text-[hsl(var(--badge-ended-fg))]'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
