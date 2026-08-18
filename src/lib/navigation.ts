import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  Package,
  Send,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * One navigation model, read by the sidebar, the command palette and the mobile
 * bar. A route appears here only if it exists — a beautiful menu item that leads
 * to a 404 is worse than no menu item.
 */

export interface NavItem {
  to: string;
  label: string;
  labelAr: string;
  icon: LucideIcon;
  /** Extra words the command palette should match on. */
  keywords?: string[];
}

export interface NavGroup {
  id: string;
  label: string;
  labelAr: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "command",
    label: "Command",
    labelAr: "القيادة",
    items: [
      {
        to: "/dashboard",
        label: "Overview",
        labelAr: "نظرة عامة",
        icon: LayoutDashboard,
        keywords: ["home", "today", "command center", "الرئيسية", "اليوم"],
      },
    ],
  },
  {
    id: "create",
    label: "Create",
    labelAr: "الإنشاء",
    items: [
      {
        to: "/creative",
        label: "Creative Studio",
        labelAr: "استوديو الإبداع",
        icon: Sparkles,
        keywords: ["campaign", "storyboard", "video", "image", "حملة", "فيديو"],
      },
      {
        to: "/calendar",
        label: "Calendar",
        labelAr: "التقويم",
        icon: CalendarDays,
        keywords: ["schedule", "plan", "جدول"],
      },
    ],
  },
  {
    id: "approve",
    label: "Approve",
    labelAr: "الاعتماد",
    items: [
      {
        to: "/publish",
        label: "Approval Queue",
        labelAr: "قائمة الاعتماد",
        icon: Send,
        keywords: ["publish", "pending", "review", "نشر", "موافقة"],
      },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    labelAr: "الذكاء",
    items: [
      {
        to: "/analytics",
        label: "Performance",
        labelAr: "الأداء",
        icon: BarChart3,
        keywords: ["analytics", "reach", "engagement", "تحليلات", "أداء"],
      },
      {
        to: "/tests",
        label: "Quality Tests",
        labelAr: "اختبارات الجودة",
        icon: FlaskConical,
        keywords: ["scenarios", "red team", "regression", "اختبار"],
      },
    ],
  },
  {
    id: "truth",
    label: "Truth",
    labelAr: "الحقيقة",
    items: [
      {
        to: "/knowledge",
        label: "Brand Constitution",
        labelAr: "دستور العلامة",
        icon: BookOpen,
        keywords: ["brand", "audiences", "projects", "claims", "العلامة", "الجمهور"],
      },
      {
        to: "/products",
        label: "Products",
        labelAr: "المنتجات",
        icon: Package,
        keywords: ["catalogue", "sku", "specifications", "منتجات"],
      },
    ],
  },
  {
    id: "system",
    label: "System",
    labelAr: "النظام",
    items: [
      {
        to: "/logs",
        label: "Activity Log",
        labelAr: "سجل النشاط",
        icon: ClipboardList,
        keywords: ["agent runs", "history", "audit", "سجل"],
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** The five destinations that fit a phone's bottom bar. */
export const MOBILE_NAV: NavItem[] = [
  ALL_NAV_ITEMS.find((i) => i.to === "/dashboard")!,
  ALL_NAV_ITEMS.find((i) => i.to === "/creative")!,
  ALL_NAV_ITEMS.find((i) => i.to === "/publish")!,
  ALL_NAV_ITEMS.find((i) => i.to === "/analytics")!,
  ALL_NAV_ITEMS.find((i) => i.to === "/products")!,
];

export const ACTIVITY_ICON = Activity;
