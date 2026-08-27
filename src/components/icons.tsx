interface IconProps {
  className?: string;
}

/** Decorative lightbulb used by context-aware AI action buttons. */
export function LightbulbIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={[
          'M9 18h6M10 22h4',
          'M8.5 14.5C7.55 13.7 7 12.5 7 11a5 5 0 0 1 10 0',
          'c0 1.5-.55 2.7-1.5 3.5-.85.72-1.28 1.48-1.4 2.5h-4.2',
          'c-.12-1.02-.55-1.78-1.4-2.5Z',
        ].join(' ')}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Decorative information mark used by the editor Help button. */
export function InfoIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 10.75V17M12 7.25h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
