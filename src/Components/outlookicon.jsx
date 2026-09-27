import React from 'react';

export default function OutlookIcon({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 7.5L12 3L22 7.5V16.5L12 21L2 16.5V7.5Z" fill="#0078D4"/>
      <path d="M2 7.5L12 3V21L2 16.5V7.5Z" fill="#0A6BBE"/>
      <rect x="5" y="9" width="10" height="6" rx="0.5" fill="#fff"/>
      <path d="M6 10.5H14M6 12H14M6 13.5H11" stroke="#0078D4" strokeWidth="0.8" strokeLinecap="round"/>
      <path d="M15 8.5L20 10.5V14.5L15 16.5V8.5Z" fill="#fff"/>
      <circle cx="17.5" cy="12.5" r="1.5" fill="#0078D4"/>
    </svg>
  );
}