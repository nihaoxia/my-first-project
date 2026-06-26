export type ShelfCategory = {
  id: string;
  title: string;
  detail: string;
  palette: string;
  miniCovers: string[];
};

export type CreateShelfCategoryResult =
  | {
      ok: true;
      category: ShelfCategory;
      categories: ShelfCategory[];
    }
  | {
      ok: false;
      reason: "empty-title" | "duplicate-title";
    };

const categoryPalettes = [
  "from-slate-950 via-indigo-900 to-sky-700",
  "from-emerald-900 via-teal-700 to-cyan-600",
  "from-rose-900 via-fuchsia-700 to-orange-400",
  "from-stone-950 via-zinc-700 to-amber-500",
] as const;

export const defaultShelfCollections: ShelfCategory[] = [
  {
    id: "favorites",
    title: "最近在读",
    detail: "共 6 本",
    palette: categoryPalettes[0],
    miniCovers: ["迷雾", "边境", "黑桥", "灯塔"],
  },
  {
    id: "learning",
    title: "英语学习",
    detail: "共 4 本",
    palette: categoryPalettes[1],
    miniCovers: ["词句", "精读", "短篇", "写作"],
  },
];

export function createShelfCategory(
  currentCategories: ShelfCategory[],
  titleInput: string,
): CreateShelfCategoryResult {
  const title = titleInput.trim().replace(/\s+/g, " ");

  if (!title) {
    return {
      ok: false,
      reason: "empty-title",
    };
  }

  if (currentCategories.some((category) => category.title === title)) {
    return {
      ok: false,
      reason: "duplicate-title",
    };
  }

  const category: ShelfCategory = {
    id: `custom-${slugifyCategoryTitle(title)}-${currentCategories.length + 1}`,
    title,
    detail: "共 0 本",
    palette: categoryPalettes[currentCategories.length % categoryPalettes.length],
    miniCovers: buildMiniCovers(title),
  };

  return {
    ok: true,
    category,
    categories: [...currentCategories, category],
  };
}

function buildMiniCovers(title: string) {
  const compactTitle = title.replace(/\s/g, "");
  const first = compactTitle.slice(0, 2) || "新书";

  return [first, "阅读", "收藏", "学习"];
}

function slugifyCategoryTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "category";
}
