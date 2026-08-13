import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "ar" | "en";

const dict = {
  catalogueSub: { ar: "كتالوج Steinheim الذي يغذي كل منشور", en: "The catalogue that feeds every post" },
  addProduct: { ar: "إضافة منتج", en: "Add product" },
  name: { ar: "الاسم", en: "Name" },
  nameAr: { ar: "الاسم بالعربية", en: "Arabic name" },
  category: { ar: "الفئة", en: "Category" },
  description: { ar: "الوصف", en: "Description" },
  keyFeatures: { ar: "المزايا (سطر لكل ميزة)", en: "Key features (one per line)" },
  brand: { ar: "Steinheim", en: "Steinheim" },
  system: { ar: "نظام التسويق الذكي", en: "AI Marketing System" },
  signIn: { ar: "تسجيل الدخول", en: "Sign in" },
  signUp: { ar: "إنشاء حساب", en: "Create account" },
  signOut: { ar: "تسجيل الخروج", en: "Sign out" },
  email: { ar: "البريد الإلكتروني", en: "Email" },
  password: { ar: "كلمة المرور", en: "Password" },
  displayName: { ar: "الاسم", en: "Name" },
  overview: { ar: "نظرة عامة", en: "Overview" },
  products: { ar: "المنتجات", en: "Products" },
  knowledge: { ar: "قاعدة المعرفة", en: "Knowledge" },
  calendar: { ar: "تقويم المحتوى", en: "Content calendar" },
  publish: { ar: "النشر", en: "Publish" },
  analytics: { ar: "التحليلات", en: "Analytics" },
  logs: { ar: "السجل", en: "Logs" },
  generateToday: { ar: "توليد محتوى اليوم", en: "Generate Today" },
  generating: { ar: "جارٍ التوليد…", en: "Generating…" },
  postsThisMonth: { ar: "منشورات هذا الشهر", en: "Posts this month" },
  published: { ar: "منشور", en: "Published" },
  approved: { ar: "معتمد", en: "Approved" },
  draft: { ar: "مسودة", en: "Draft" },
  reviewed: { ar: "تمت المراجعة", en: "Reviewed" },
  ideas: { ar: "الأفكار", en: "Ideas" },
  engagementRate: { ar: "معدل التفاعل", en: "Engagement rate" },
  impressions: { ar: "الانطباعات", en: "Impressions" },
  engagements: { ar: "التفاعلات", en: "Engagements" },
  clicks: { ar: "النقرات", en: "Clicks" },
  leads: { ar: "الليدز", en: "Leads" },
  topPost: { ar: "أفضل منشور", en: "Top post" },
  status: { ar: "الحالة", en: "Status" },
  platform: { ar: "المنصة", en: "Platform" },
  goal: { ar: "الهدف", en: "Goal" },
  audience: { ar: "الجمهور", en: "Audience" },
  product: { ar: "المنتج", en: "Product" },
  topic: { ar: "الموضوع", en: "Topic" },
  date: { ar: "التاريخ", en: "Date" },
  actions: { ar: "إجراءات", en: "Actions" },
  open: { ar: "فتح", en: "Open" },
  save: { ar: "حفظ", en: "Save" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  delete: { ar: "حذف", en: "Delete" },
  add: { ar: "إضافة", en: "Add" },
  edit: { ar: "تعديل", en: "Edit" },
  approve: { ar: "اعتماد", en: "Approve" },
  markPublished: { ar: "تسجيل كمنشور", en: "Mark as published" },
  regenerate: { ar: "إعادة التوليد", en: "Regenerate" },
  generateImage: { ar: "توليد صورة", en: "Generate image" },
  review: { ar: "مراجعة", en: "Review" },
  reviewScore: { ar: "درجة المراجعة", en: "Review score" },
  reviewNotes: { ar: "ملاحظات المراجع", en: "Reviewer notes" },
  imagePrompt: { ar: "وصف الصورة", en: "Image prompt" },
  hashtags: { ar: "الهاشتاجات", en: "Hashtags" },
  arabicCopy: { ar: "النص العربي", en: "Arabic copy" },
  englishCopy: { ar: "النص الإنجليزي", en: "English copy" },
  brandProfile: { ar: "ملف العلامة", en: "Brand profile" },
  audiences: { ar: "الجماهير", en: "Audiences" },
  projects: { ar: "المشاريع", en: "Projects" },
  categories: { ar: "الفئات", en: "Categories" },
  noData: { ar: "لا توجد بيانات بعد", en: "No data yet" },
  loading: { ar: "جارٍ التحميل…", en: "Loading…" },
  publishedUrl: { ar: "رابط المنشور", en: "Published URL" },
  addMetrics: { ar: "إضافة أرقام أداء", en: "Add metrics" },
  agentRuns: { ar: "تشغيل الوكلاء", en: "Agent runs" },
  allPosts: { ar: "كل المنشورات", en: "All posts" },
  heroTitle: { ar: "تسويق Steinheim، مؤتمت.", en: "Steinheim marketing, automated." },
  heroSub: {
    ar: "قاعدة معرفة كاملة عن المنتجات والمشاريع، وفريق وكلاء ذكاء اصطناعي يكتب وينشر محتوى يومي على LinkedIn وFacebook وInstagram.",
    en: "A complete product and project knowledge base, plus an AI agent team that writes and ships daily content for LinkedIn, Facebook and Instagram.",
  },
  enterDashboard: { ar: "ادخل لوحة التحكم", en: "Enter dashboard" },
  sales: { ar: "بيع", en: "Sales" },
  awareness: { ar: "توعية", en: "Awareness" },
  brandGoal: { ar: "علامة تجارية", en: "Brand" },
} as const;

export type TKey = keyof typeof dict;

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string; dir: "rtl" | "ltr" };

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    const stored = window.localStorage.getItem("steinheim-lang");
    if (stored === "ar" || stored === "en") setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("steinheim-lang", l);
  }, []);

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, dir, t: (k: TKey) => dict[k][lang] }),
    [lang, setLang, dir],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
