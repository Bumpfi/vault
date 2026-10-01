import type { ComponentProps } from 'react'
import { cn } from '#/lib/utils'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid gap-2 px-6', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('leading-none font-semibold', className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-6', className)} {...props} />
}
