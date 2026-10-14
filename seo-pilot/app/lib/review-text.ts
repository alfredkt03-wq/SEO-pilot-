// Review-request email text shared by the server (sending) and the Reviews page (editor).
// Placeholders: {store} = store name, {name} = customer's first name.
export const DEFAULT_SUBJECT = "How was your order from {store}?";
export const DEFAULT_MESSAGE = "Thank you for shopping at {store}. Could you spare half a minute to tell us how it went?";

export const REVIEW_PRESETS: Array<{ key: string; label: string; subject: string; message: string }> = [
  { key: "standard", label: "Standard", subject: DEFAULT_SUBJECT, message: DEFAULT_MESSAGE },
  {
    key: "friendly",
    label: "Friendly",
    subject: "How was your order, {name}?",
    message: "Thank you for ordering from {store}! We'd love to hear how everything went. It only takes a few seconds: just tap a star below.",
  },
  {
    key: "short",
    label: "Short",
    subject: "Quick question about your order",
    message: "How did we do? Tap a star to let {store} know.",
  },
  {
    key: "personal",
    label: "Personal",
    subject: "{name}, how did we do?",
    message: "Thank you for choosing {store}. Your honest opinion helps us improve and helps other shoppers decide.\n\nIt takes less than a minute.",
  },
];
