const CATEGORY_DEFINITIONS = [
  {
    key: "produce",
    label: "Frugt & groent",
    sortOrder: 10,
    keywords: ["agurk", "appelsin", "avocado", "banan", "citron", "frugt", "groent", "groentsager", "gulerod", "kartoffel", "kiwi", "lime", "loeg", "paere", "peberfrugt", "salat", "spinat", "tomat"],
  },
  {
    key: "bakery",
    label: "Broed & bager",
    sortOrder: 20,
    keywords: ["bagel", "bolle", "broed", "burgerbolle", "croissant", "rugbroed", "toast", "tortilla", "wrap"],
  },
  {
    key: "dairy",
    label: "Mejeri & aeg",
    sortOrder: 30,
    keywords: ["aeg", "butter", "creme fraiche", "flode", "hytteost", "maelk", "mozzarella", "ost", "skyr", "smor", "yoghurt"],
  },
  {
    key: "meat",
    label: "Koed & fisk",
    sortOrder: 40,
    keywords: ["bacon", "boef", "fars", "fisk", "hakket", "kylling", "laks", "okse", "paalaeg", "pølse", "skinke", "tun"],
  },
  {
    key: "chilled",
    label: "Koel",
    sortOrder: 50,
    keywords: ["dip", "falafel", "frisk pasta", "hummus", "pasta", "pesto", "salatmix", "tofu"],
  },
  {
    key: "frozen",
    label: "Frost",
    sortOrder: 60,
    keywords: ["frossen", "frost", "is", "pizza", "pommes", "ærter"],
  },
  {
    key: "pantry",
    label: "Kolonialt",
    sortOrder: 70,
    keywords: ["boller i karry", "bouillon", "dressing", "havregryn", "kaffe", "ketchup", "kolonial", "linser", "mel", "olie", "pasta", "peber", "ris", "salt", "suppe", "tomatpaas", "tunfisk"],
  },
  {
    key: "candy",
    label: "Snacks & slik",
    sortOrder: 80,
    keywords: ["chips", "chokolade", "is", "kage", "kiks", "popcorn", "slik", "snack", "vingummi"],
  },
  {
    key: "drinks",
    label: "Drikkevarer",
    sortOrder: 90,
    keywords: ["juice", "saft", "sodavand", "vand", "vin", "oel"],
  },
  {
    key: "household",
    label: "Husholdning",
    sortOrder: 100,
    keywords: ["affaldsposer", "alufolie", "koekkenrulle", "opvasketabs", "rengoering", "toiletpapir", "vaskemiddel"],
  },
  {
    key: "care",
    label: "Pleje & apotek",
    sortOrder: 110,
    keywords: ["bind", "deodorant", "medicin", "panodil", "plaster", "shampoo", "tandboerste", "tandpasta"],
  },
  {
    key: "other",
    label: "Andet",
    sortOrder: 999,
    keywords: [],
  },
] as const;

export const SHOPPING_CATEGORY_OPTIONS = CATEGORY_DEFINITIONS.map(({ key, label }) => ({
  key,
  label,
}));

const CATEGORY_ALIAS_LOOKUP = new Map<string, string>(
  CATEGORY_DEFINITIONS.flatMap((category) => [
    [category.key, category.key],
    [normalizeToken(category.label), category.key],
  ]),
);

type CategoryDefinition = (typeof CATEGORY_DEFINITIONS)[number];

export function inferShoppingCategory(label: string) {
  const normalizedLabel = normalizeToken(label);

  for (const category of CATEGORY_DEFINITIONS) {
    if (category.key === "other") {
      continue;
    }

    if (category.keywords.some((keyword) => normalizedLabel.includes(normalizeToken(keyword)))) {
      return category.key;
    }
  }

  return "other";
}

export function normalizeShoppingCategory(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return CATEGORY_ALIAS_LOOKUP.get(normalizeToken(value)) ?? "other";
}

export function getShoppingCategoryMeta(value: string | null | undefined): CategoryDefinition {
  const normalized = normalizeShoppingCategory(value) ?? "other";
  return CATEGORY_DEFINITIONS.find((category) => category.key === normalized) ?? CATEGORY_DEFINITIONS.at(-1)!;
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
