export const messages = {
  en: {
    welcome: "Welcome to Bank QMS",
    getTicket: "Get a ticket",
    checkTicket: "Check or cancel ticket",
    callNext: "Call next",
    noCustomers: "No customers waiting",
  },
  am: {
    welcome: "ወደ Bank QMS እንኳን ደህና መጡ",
    getTicket: "ትኬት ይውሰዱ",
    checkTicket: "ትኬት ይመልከቱ ወይም ይሰርዙ",
    callNext: "ቀጣዩን ይጥሩ",
    noCustomers: "የሚጠብቅ ደንበኛ የለም",
  },
} as const;

export type Locale = keyof typeof messages;
