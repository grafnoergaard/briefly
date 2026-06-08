import { CalendarRange, Home, ShoppingCart, UtensilsCrossed } from "lucide-react";

export const primaryNavigationItems = [
  { href: "/", label: "Hjem", icon: Home },
  { href: "/calendar", label: "Kalender", icon: CalendarRange },
  { href: "/meal-plan", label: "Madplan", icon: UtensilsCrossed },
  { href: "/shopping", label: "Indkøb", icon: ShoppingCart },
] as const;
