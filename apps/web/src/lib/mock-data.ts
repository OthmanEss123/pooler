export const revenueBars = [42, 55, 48, 68, 61, 74, 70, 82, 76, 88, 84, 94];

export const dashboardStats = [
  {
    label: "Revenue",
    value: "$128.4K",
    change: "+18.2%",
    detail: "vs last month",
    trend: "up" as const,
  },
  {
    label: "Orders",
    value: "3,284",
    change: "+9.7%",
    detail: "from synced stores",
    trend: "up" as const,
  },
  {
    label: "Contacts",
    value: "48,920",
    change: "+6.1%",
    detail: "active profiles",
    trend: "up" as const,
  },
  {
    label: "Conversion rate",
    value: "5.84%",
    change: "-0.4%",
    detail: "checkout flow",
    trend: "down" as const,
  },
];

export const recentOrders = [
  {
    id: "10091",
    customer: "Maya Chen",
    email: "maya@northstar.co",
    total: "$420.00",
    status: "Paid",
    source: "WooCommerce",
    date: "Today, 10:42",
  },
  {
    id: "10090",
    customer: "Jonas Meyer",
    email: "jonas@studio-meyer.com",
    total: "$188.50",
    status: "Fulfilled",
    source: "Shop",
    date: "Today, 09:16",
  },
  {
    id: "10089",
    customer: "Ana Garcia",
    email: "ana@lumenretail.io",
    total: "$76.20",
    status: "Pending",
    source: "Manual",
    date: "Yesterday",
  },
  {
    id: "10088",
    customer: "Theo Laurent",
    email: "theo@atelier.fr",
    total: "$1,240.00",
    status: "Paid",
    source: "WooCommerce",
    date: "Yesterday",
  },
];

export const recentContacts = [
  {
    id: "c_1",
    name: "Maya Chen",
    email: "maya@northstar.co",
    segment: "Champion",
    revenue: "$4,820",
    status: "Subscribed",
  },
  {
    id: "c_2",
    name: "Jonas Meyer",
    email: "jonas@studio-meyer.com",
    segment: "Loyal",
    revenue: "$2,340",
    status: "Subscribed",
  },
  {
    id: "c_3",
    name: "Ana Garcia",
    email: "ana@lumenretail.io",
    segment: "At risk",
    revenue: "$910",
    status: "Pending",
  },
];

export const contacts = [
  ...recentContacts,
  {
    id: "c_4",
    name: "Sofia Bennett",
    email: "sofia@hausgoods.com",
    segment: "New",
    revenue: "$340",
    status: "Subscribed",
  },
  {
    id: "c_5",
    name: "Owen Parker",
    email: "owen@papertrail.dev",
    segment: "Potential",
    revenue: "$1,120",
    status: "Unsubscribed",
  },
  {
    id: "c_6",
    name: "Lina Moreau",
    email: "lina@marche.co",
    segment: "Lost",
    revenue: "$220",
    status: "Bounced",
  },
];

export const orders = [
  ...recentOrders,
  {
    id: "10087",
    customer: "Sofia Bennett",
    email: "sofia@hausgoods.com",
    total: "$344.30",
    status: "Refunded",
    source: "WooCommerce",
    date: "May 16",
  },
  {
    id: "10086",
    customer: "Owen Parker",
    email: "owen@papertrail.dev",
    total: "$88.00",
    status: "Cancelled",
    source: "Manual",
    date: "May 15",
  },
];

export const products = [
  {
    id: "p_1",
    name: "Signature Hoodie",
    sku: "HD-204",
    category: "Apparel",
    price: "$84.00",
    stock: 42,
    status: "In stock",
    sync: "Synced 12 min ago",
  },
  {
    id: "p_2",
    name: "Core Bottle",
    sku: "BT-118",
    category: "Accessories",
    price: "$32.00",
    stock: 8,
    status: "Low stock",
    sync: "Synced 26 min ago",
  },
  {
    id: "p_3",
    name: "Studio Tote",
    sku: "TT-511",
    category: "Bags",
    price: "$58.00",
    stock: 0,
    status: "Out of stock",
    sync: "Synced 1 hour ago",
  },
  {
    id: "p_4",
    name: "Ceramic Cup",
    sku: "CP-044",
    category: "Home",
    price: "$26.00",
    stock: 104,
    status: "In stock",
    sync: "Synced 2 hours ago",
  },
];

export const integrations = [
  {
    name: "WooCommerce",
    description: "Sync products, customers, orders and webhooks from your store.",
    status: "Connected" as const,
    href: "/integrations/woocommerce",
    meta: "Last sync 12 min ago",
  },
  {
    name: "Google Ads",
    description: "Pull spend, campaign performance and audience activation data.",
    status: "Needs attention" as const,
    href: "/integrations/google-ads",
    meta: "OAuth refresh needed",
  },
  {
    name: "GA4",
    description: "Centralize event, session and conversion analytics.",
    status: "Connected" as const,
    href: "/integrations/ga4",
    meta: "Streaming events",
  },
];

export const channels = [
  { name: "Email", revenue: "$42.8K", roas: "8.2x", change: "+14%" },
  { name: "Google Ads", revenue: "$36.1K", roas: "4.7x", change: "+8%" },
  { name: "Organic", revenue: "$29.4K", roas: "12.1x", change: "+21%" },
  { name: "Direct", revenue: "$20.1K", roas: "6.4x", change: "-2%" },
];

export const teamMembers = [
  {
    id: "u_1",
    name: "Alex Morgan",
    email: "alex@pilot.test",
    role: "Owner",
    status: "Active",
  },
  {
    id: "u_2",
    name: "Priya Shah",
    email: "priya@pilot.test",
    role: "Admin",
    status: "Active",
  },
  {
    id: "u_3",
    name: "Noah Kim",
    email: "noah@pilot.test",
    role: "Member",
    status: "Invited",
  },
];

export const apiKeys = [
  {
    id: "key_1",
    name: "Production ingest",
    prefix: "pk_live_7a92",
    scope: "INGEST",
    lastUsed: "12 min ago",
  },
  {
    id: "key_2",
    name: "Analytics read model",
    prefix: "pk_live_2be1",
    scope: "READ_ONLY",
    lastUsed: "Yesterday",
  },
];
