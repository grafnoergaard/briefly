import { CalendarRange, Home, ListTodo, Settings2, ShoppingCart, UtensilsCrossed } from "lucide-react";

export const navigationItems = [
  { href: "/", label: "Hjem", icon: Home },
  { href: "/calendar", label: "Kalender", icon: CalendarRange },
  { href: "/tasks", label: "Lister", icon: ListTodo },
  { href: "/meal-plan", label: "Madplan", icon: UtensilsCrossed },
  { href: "/shopping", label: "Indkøb", icon: ShoppingCart },
  { href: "/settings", label: "Indstillinger", icon: Settings2 },
] as const;
