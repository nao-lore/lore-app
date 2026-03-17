export function EmptyLogs() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* document outline */}
      <rect x="18" y="10" width="44" height="56" rx="4" stroke="var(--text-muted)" strokeWidth="2" opacity="0.3" />
      {/* folded corner */}
      <path d="M48 10L62 24" stroke="var(--text-muted)" strokeWidth="2" opacity="0.2" />
      <path d="M48 10V20C48 22.2 49.8 24 52 24H62" stroke="var(--text-muted)" strokeWidth="2" opacity="0.25" />
      {/* text lines */}
      <line x1="26" y1="32" x2="54" y2="32" stroke="var(--text-muted)" strokeWidth="2" opacity="0.2" />
      <line x1="26" y1="40" x2="48" y2="40" stroke="var(--text-muted)" strokeWidth="2" opacity="0.15" />
      <line x1="26" y1="48" x2="50" y2="48" stroke="var(--text-muted)" strokeWidth="2" opacity="0.1" />
      {/* sparkle */}
      <circle cx="60" cy="14" r="3" fill="var(--accent)" opacity="0.6" />
      <circle cx="66" cy="8" r="1.5" fill="var(--accent)" opacity="0.35" />
    </svg>
  );
}

export function EmptyTodos() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* checkbox */}
      <rect x="24" y="24" width="32" height="32" rx="6" stroke="var(--text-muted)" strokeWidth="2" opacity="0.3" />
      {/* checkmark */}
      <path d="M33 40L38 46L48 34" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      {/* ray lines */}
      <line x1="40" y1="14" x2="40" y2="20" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
      <line x1="56" y1="18" x2="52" y2="22" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
      <line x1="24" y1="18" x2="28" y2="22" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
      <line x1="62" y1="40" x2="60" y2="40" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
      <line x1="18" y1="40" x2="20" y2="40" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
    </svg>
  );
}

export function EmptyProjects() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* folder body */}
      <path
        d="M12 26C12 23.8 13.8 22 16 22H32L36 16H60C62.2 16 64 17.8 64 20V22"
        stroke="var(--text-muted)" strokeWidth="2" opacity="0.25"
      />
      <rect x="12" y="26" width="52" height="36" rx="4" stroke="var(--text-muted)" strokeWidth="2" opacity="0.3" />
      {/* folder tab */}
      <path d="M12 26V22C12 19.8 13.8 18 16 18H30L34 26" stroke="var(--text-muted)" strokeWidth="2" opacity="0.3" />
      {/* plus sign */}
      <line x1="38" y1="36" x2="38" y2="52" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <line x1="30" y1="44" x2="46" y2="44" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      {/* subtle dot */}
      <circle cx="60" cy="20" r="2" fill="var(--accent)" opacity="0.3" />
    </svg>
  );
}

export function EmptyDashboard() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* grid/dashboard layout */}
      <rect x="10" y="14" width="26" height="22" rx="4" stroke="var(--text-muted)" strokeWidth="2" opacity="0.25" />
      <rect x="44" y="14" width="26" height="22" rx="4" stroke="var(--text-muted)" strokeWidth="2" opacity="0.2" />
      <rect x="10" y="44" width="26" height="22" rx="4" stroke="var(--text-muted)" strokeWidth="2" opacity="0.2" />
      <rect x="44" y="44" width="26" height="22" rx="4" stroke="var(--text-muted)" strokeWidth="2" opacity="0.15" />
      {/* sparkle accents */}
      <circle cx="23" cy="25" r="4" fill="var(--accent)" opacity="0.5" />
      <circle cx="57" cy="25" r="3" fill="var(--accent)" opacity="0.3" />
      <circle cx="23" cy="55" r="3" fill="var(--accent)" opacity="0.25" />
      <circle cx="57" cy="55" r="2" fill="var(--accent)" opacity="0.15" />
    </svg>
  );
}

export function EmptyTimeline() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* clock circle */}
      <circle cx="40" cy="38" r="24" stroke="var(--text-muted)" strokeWidth="2" opacity="0.3" />
      {/* clock hands */}
      <line x1="40" y1="38" x2="40" y2="24" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <line x1="40" y1="38" x2="50" y2="38" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      {/* center dot */}
      <circle cx="40" cy="38" r="2" fill="var(--text-muted)" opacity="0.3" />
      {/* hour markers */}
      <circle cx="40" cy="18" r="1.5" fill="var(--text-muted)" opacity="0.2" />
      <circle cx="60" cy="38" r="1.5" fill="var(--text-muted)" opacity="0.2" />
      <circle cx="40" cy="58" r="1.5" fill="var(--text-muted)" opacity="0.2" />
      <circle cx="20" cy="38" r="1.5" fill="var(--text-muted)" opacity="0.2" />
      {/* accent dots suggesting timeline */}
      <circle cx="14" cy="68" r="2.5" fill="var(--accent)" opacity="0.4" />
      <circle cx="30" cy="72" r="2" fill="var(--accent)" opacity="0.25" />
      <circle cx="50" cy="72" r="2" fill="var(--accent)" opacity="0.25" />
      <circle cx="66" cy="68" r="2.5" fill="var(--accent)" opacity="0.15" />
    </svg>
  );
}
