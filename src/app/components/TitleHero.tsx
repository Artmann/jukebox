import { PlayIcon, RotateCcwIcon } from 'lucide-react'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

import { PageHeader } from './PageHeader'

interface TitleHeroProps {
  actions: ReactNode
  genres: ReadonlyArray<string>
  imageUrl: string | null
  // Keyed elements, shown in one line separated by dots.
  metadata: ReadonlyArray<ReactElement>
  overview: string | null
  // A line above the overview, like "S3 E7: Too Much Birthday", for when the
  // hero features an episode rather than the show itself.
  subheading?: string
  title: string
}

/**
 * The full-bleed landing hero for a show or movie: artwork filling most of the
 * viewport, with the title, details and play actions anchored bottom-left.
 */
export function TitleHero({
  actions,
  genres,
  imageUrl,
  metadata,
  overview,
  subheading,
  title
}: TitleHeroProps): ReactElement {
  return (
    <>
      <div className="absolute inset-x-0 top-0 h-[80svh] min-h-120 overflow-hidden">
        {imageUrl ? (
          <img
            alt=""
            className="size-full object-cover object-top animate-in fade-in duration-500"
            key={imageUrl}
            src={imageUrl}
          />
        ) : (
          <div className="size-full bg-linear-to-b from-muted to-background" />
        )}

        <div className="absolute inset-0 bg-linear-to-r from-background/90 via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/30 to-transparent" />
      </div>

      <PageHeader />

      <section className="relative flex min-h-[calc(80svh-5rem)] flex-col justify-end px-4 pb-8 sm:px-6">
        <div className="flex max-w-2xl flex-col items-start gap-3 sm:gap-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground text-balance sm:text-6xl">
            {title}
          </h1>

          {metadata.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {metadata.map((item, index) => (
                <Fragment key={item.key}>
                  {index > 0 && <span aria-hidden>·</span>}
                  {item}
                </Fragment>
              ))}
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-3">
            {actions}
          </div>

          {subheading && (
            <h2 className="mt-2 text-lg font-semibold text-foreground">
              {subheading}
            </h2>
          )}

          {overview && (
            <p className="text-sm leading-relaxed text-foreground/80 line-clamp-4 sm:text-base">
              {overview}
            </p>
          )}

          {genres.length > 0 && (
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {genres.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}

interface PlayButtonsProps {
  label: string
  // How far into the title the viewer is, drawn under the label. Omit for
  // titles that haven't been started.
  progressPercent?: number
  // Shown as a Restart button when the viewer is partway through.
  restartTo?: string
  to: string
}

export function PlayButtons({
  label,
  progressPercent,
  restartTo,
  to
}: PlayButtonsProps): ReactElement {
  return (
    <>
      <Button
        asChild
        className="min-h-11 min-w-44 bg-white text-base font-semibold text-black hover:bg-white/90"
        size="lg"
      >
        <Link to={to}>
          <PlayIcon className="fill-current" />

          <span className="flex flex-col gap-1">
            {label}

            {progressPercent !== undefined && progressPercent > 0 && (
              <span className="block h-0.5 w-full rounded-full bg-black/20">
                <span
                  className="block h-full rounded-full bg-black"
                  style={{ width: `${progressPercent}%` }}
                />
              </span>
            )}
          </span>
        </Link>
      </Button>

      {restartTo && (
        <Button
          asChild
          className="min-h-11 bg-white/15 text-base font-semibold text-foreground hover:bg-white/25"
          size="lg"
          variant="secondary"
        >
          <Link to={restartTo}>
            <RotateCcwIcon />
            Restart
          </Link>
        </Button>
      )}
    </>
  )
}
