import React from "react";

export default function LinkedInIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path fill="#fff" d="M7.1 9.5H4.6V19h2.5V9.5zM5.85 5A1.45 1.45 0 1 0 5.85 7.9 1.45 1.45 0 0 0 5.85 5zM19.4 13.6c0-2.6-1.4-4.3-3.7-4.3-1.3 0-2.1.7-2.5 1.3V9.5h-2.4V19h2.5v-4.9c0-1.3.6-2.2 1.7-2.2s1.6.8 1.6 2.2V19h2.5l.3-5.4z" />
    </svg>
  );
}
