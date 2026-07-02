import * as React from 'react';
import { cn } from '../../lib/utils';

function Card({ className, ...props }) {
  return (
    <div
      className={cn('rounded-xl border bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm border-[hsl(var(--border))]', className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 p-4 md:p-5', className)} {...props} />;
}

function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-xl font-semibold leading-none tracking-tight', className)} {...props} />;
}

function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-[hsl(var(--muted-foreground))]', className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div className={cn('p-4 pt-0 md:p-5 md:pt-0', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
