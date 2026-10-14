// FLP mark: a rounded play triangle inside a soft square, in the accent colour.
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="FLP" role="img">
      <rect x="2" y="2" width="60" height="60" rx="16" fill="var(--accent)" />
      <path d="M25 19.5v25c0 1.6 1.7 2.5 3 1.7l20-12.5c1.3-.8 1.3-2.6 0-3.4l-20-12.5c-1.3-.8-3 .1-3 1.7z" fill="var(--accent-contrast)" />
    </svg>
  )
}
