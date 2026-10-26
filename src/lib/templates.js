// Event templates: a starting point for a new event type. The built-in ones live here; a host's
// own are rows of event_templates ({ id, name, data }), saved from the event type form.
// data holds event type fields; dates that tie an event to the calendar are never kept.

export const TEMPLATE_FIELDS = [
  'name', 'description', 'duration', 'location', 'meeting_url', 'address',
  'booking_type', 'max_attendees', 'requires_approval', 'email_required',
  'schedule', 'freq', 'every', 'days',
];

export const BUILT_IN_TEMPLATES = [
  {
    id: 'quick-chat', name: 'Quick chat',
    data: { name: 'Quick chat', duration: 15, location: 'Google Meet', description: 'A short call to say hello or answer a quick question.' },
  },
  {
    id: 'meeting', name: '30 minute meeting',
    data: { name: '30 minute meeting', duration: 30, location: 'Google Meet' },
  },
  {
    id: 'consultation', name: 'Consultation',
    data: { name: 'Consultation', duration: 60, location: 'Zoom', requires_approval: true, description: 'A full hour to go through your needs. I confirm each request personally.' },
  },
  {
    id: 'whatsapp-call', name: 'WhatsApp call',
    data: { name: 'WhatsApp call', duration: 30, location: 'WhatsApp call' },
  },
  {
    id: 'in-person', name: 'In-person meeting',
    data: { name: 'In-person meeting', duration: 60, location: 'In person' },
  },
  {
    id: 'office-hours', name: 'Office hours',
    data: { name: 'Office hours', duration: 15, location: 'Google Meet', freq: 'week', every: 1, days: [2, 4], description: 'Drop-in slots on Tuesdays and Thursdays.' },
  },
  {
    id: 'group-class', name: 'Weekly class',
    data: { name: 'Weekly class', duration: 60, location: 'Zoom', booking_type: 'group', max_attendees: 10, freq: 'week', every: 1, days: [1], description: 'A group session every Monday. Book a spot.' },
  },
  {
    id: 'monthly-review', name: 'Monthly check-in',
    data: { name: 'Monthly check-in', duration: 45, location: 'Google Meet', freq: 'month', every: 1, description: 'One session a month to review progress.' },
  },
];

// the template's fields from an event type (or the form's values)
export const templateData = (values) =>
  Object.fromEntries(TEMPLATE_FIELDS.filter((k) => values[k] !== undefined).map((k) => [k, values[k]]));

// "30 min · Google Meet · Weekly"
export const templateSummary = (data) => {
  const parts = [`${data.duration || 30} min`, data.location || 'Google Meet'];
  if (data.booking_type === 'group') parts.push(`Group of ${data.max_attendees || 2}`);
  if (data.schedule !== 'dates' && data.freq === 'month') parts.push('Monthly');
  else if (data.schedule !== 'dates' && data.days?.length) parts.push('Weekly');
  return parts.join(' · ');
};
