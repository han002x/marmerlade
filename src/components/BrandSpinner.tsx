import { useId } from 'react';

/* The brand jar as a loader: the cap hinges open, marmalade rises, the cap
   shuts; then it opens again and the jar drains. Same drawing as favicon.svg. */
export default function BrandSpinner({ size = 24, label = 'Loading' }: { size?: number; label?: string }) {
  const clip = `jar${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className="brand-spinner" viewBox="0 0 32 32" width={size} height={size} role="status" aria-label={label}>
      <clipPath id={clip}>
        <path d="M7 11.5C7 9.8 8.3 9 10 9H22C23.7 9 25 9.8 25 11.5V25C25 26.7 23.7 28 22 28H10C8.3 28 7 26.7 7 25Z" />
      </clipPath>
      <path d="M7 11.5C7 9.8 8.3 9 10 9H22C23.7 9 25 9.8 25 11.5V25C25 26.7 23.7 28 22 28H10C8.3 28 7 26.7 7 25Z" fill="#f6efe2" />
      <g clipPath={`url(#${clip})`}>
        <g className="brand-spinner-level">
          <path className="brand-spinner-wave" fill="#f2a23a"
            d="M-2 10.6q2.25-1 4.5 0t4.5 0 4.5 0 4.5 0 4.5 0 4.5 0 4.5 0 4.5 0V30H-2Z" />
        </g>
      </g>
      <path d="M7 11.5C7 9.8 8.3 9 10 9H22C23.7 9 25 9.8 25 11.5V25C25 26.7 23.7 28 22 28H10C8.3 28 7 26.7 7 25Z"
        fill="none" stroke="#3a352e" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="16" cy="19" r="5.6" fill="#fbf8f1" stroke="#3a352e" strokeWidth="1.6" />
      <path d="M14.2 16.7 12 19 14.2 21.3M17.8 16.7 20 19 17.8 21.3" fill="none" stroke="#d0532f"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect className="brand-spinner-cap" x="8" y="4" width="16" height="5" rx="1.5" fill="#e3d8c4"
        stroke="#3a352e" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
