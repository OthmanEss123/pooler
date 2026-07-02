import {
  BarChart3,
  Bot,
  KeyRound,
  Layers3,
  LayoutDashboard,
  Package,
  Plug,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";

export const mainNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Products", href: "/products", icon: Package },
  { name: "Segments", href: "/segments", icon: Layers3 },
  { name: "Integrations", href: "/integrations", icon: Plug },
];

export const settingsNavigation = [
  { name: "Team", href: "/settings/team", icon: Users },
  { name: "Billing", href: "/settings/billing", icon: WalletCards },
  { name: "API Keys", href: "/settings/api-keys", icon: KeyRound },
  { name: "Settings", href: "/settings", icon: Settings },
];
