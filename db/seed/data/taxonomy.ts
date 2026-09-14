/**
 * Veyora launch taxonomy. Original content; brand names are Veyora house labels.
 * Photography: Unsplash License (https://unsplash.com/license) — see CREDITS.md.
 */

export type SeedAttribute = {
  slug: string;
  name: string;
  type: "SELECT" | "COLOR";
  isVariantOption: boolean;
  isFilterable: boolean;
  values: Array<string | { value: string; hex: string }>;
};

export const ATTRIBUTES: SeedAttribute[] = [
  { slug: "size", name: "Size", type: "SELECT", isVariantOption: true, isFilterable: true, values: ["XS", "S", "M", "L", "XL"] },
  { slug: "shoe-size", name: "Shoe size (EU)", type: "SELECT", isVariantOption: true, isFilterable: true, values: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"] },
  { slug: "kids-size", name: "Kids size", type: "SELECT", isVariantOption: true, isFilterable: true, values: ["0–3 M", "3–6 M", "6–12 M", "12–18 M", "2Y", "4Y", "6Y", "8Y"] },
  { slug: "ring-size", name: "Ring size (US)", type: "SELECT", isVariantOption: true, isFilterable: true, values: ["5", "6", "7", "8"] },
  { slug: "case-size", name: "Case size", type: "SELECT", isVariantOption: true, isFilterable: true, values: ["34 mm", "36 mm", "38 mm", "40 mm", "41 mm", "45 mm"] },
  { slug: "volume", name: "Volume", type: "SELECT", isVariantOption: true, isFilterable: false, values: ["15 ml", "30 ml", "50 ml"] },
  {
    slug: "colour",
    name: "Colour",
    type: "COLOR",
    isVariantOption: false,
    isFilterable: true,
    values: [
      { value: "Black", hex: "#111111" },
      { value: "White", hex: "#f7f7f5" },
      { value: "Ivory", hex: "#efe8da" },
      { value: "Grey", hex: "#9a9ca1" },
      { value: "Navy", hex: "#1f2a44" },
      { value: "Blue", hex: "#3b64b3" },
      { value: "Green", hex: "#2f6b57" },
      { value: "Red", hex: "#b32a2a" },
      { value: "Pink", hex: "#e8a9b4" },
      { value: "Purple", hex: "#6b3f7a" },
      { value: "Yellow", hex: "#e8c34a" },
      { value: "Brown", hex: "#7a4f32" },
      { value: "Tan", hex: "#c49a6c" },
      { value: "Gold", hex: "#c9a64b" },
      { value: "Silver", hex: "#c0c3c7" },
      { value: "Rose gold", hex: "#d7a28f" },
      { value: "Multi", hex: "linear-gradient(135deg,#e8c34a,#b32a2a,#3b64b3)" },
    ],
  },
  {
    slug: "material",
    name: "Material",
    type: "SELECT",
    isVariantOption: false,
    isFilterable: true,
    values: [
      "Organic cotton", "Cotton", "Wool", "Silk", "Viscose", "Denim", "Leather", "Suede", "Canvas", "Recycled polyester",
      "Stainless steel", "Aluminium", "Titanium", "Sterling silver", "Gold vermeil", "White gold", "Pearl", "Acetate",
      "Ceramic", "Wood", "Brass", "Velvet", "Soy wax", "Glass",
    ],
  },
];

export type SeedBrand = { slug: string; name: string; description: string; story: string; featured?: boolean };

export const BRANDS: SeedBrand[] = [
  {
    slug: "maison-aurele",
    name: "Maison Aurèle",
    featured: true,
    description: "Feminine ready-to-wear cut from natural fibres, designed to be worn season after season.",
    story: "Maison Aurèle designs in small, considered drops. Every piece starts with the fabric — silks, viscose and organic cottons chosen for how they move and how they age — and is finished in family-run ateliers we visit every season.",
  },
  {
    slug: "northline-tailoring",
    name: "Northline Tailoring",
    featured: true,
    description: "Modern menswear built on classic tailoring: soft shoulders, clean lines, lasting cloth.",
    story: "Northline takes the rigour of traditional tailoring and removes the stiffness. Unstructured jackets, breathable shirting and suits that travel well — made for the way people actually dress now.",
  },
  {
    slug: "common-thread",
    name: "Common Thread",
    description: "Everyday essentials in organic and recycled fibres. Wear often, wash often.",
    story: "Common Thread makes the pieces you reach for most — tees, sweats, denim and outerwear — with certified organic cotton, recycled yarns and transparent factory partners.",
  },
  {
    slug: "little-wren",
    name: "Little Wren",
    description: "Soft, durable clothing and heirloom toys for babies and children.",
    story: "Little Wren designs for play: generous fits that grow with children, fabrics that survive the wash, and wooden toys finished with water-based, child-safe paints.",
  },
  {
    slug: "lumiere-skin",
    name: "Lumière Skin",
    featured: true,
    description: "Botanical skincare formulated with clinically studied actives. Fragrance-light, results-first.",
    story: "Lumière pairs plant oils and extracts with proven actives at meaningful concentrations. Formulas are dermatologist-tested, cruelty-free and packaged in recyclable glass wherever possible.",
  },
  {
    slug: "atelier-hue",
    name: "Atelier Hue",
    description: "Colour cosmetics and tools with a professional finish and an easy hand.",
    story: "Atelier Hue was started by working make-up artists who wanted studio results without studio effort: blendable pigments, buildable shades and tools that last years, not months.",
  },
  {
    slug: "orovia",
    name: "Orovia",
    featured: true,
    description: "Fine and demi-fine jewellery in recycled gold, sterling silver and ethically sourced stones.",
    story: "Orovia works exclusively with recycled precious metals and traceable stones. Each piece is hand-finished and hallmarked, and comes with a lifetime cleaning and re-plating service.",
  },
  {
    slug: "tempo-nord",
    name: "Tempo Nord",
    featured: true,
    description: "Scandinavian-designed watches, from quiet dress pieces to capable smartwatches.",
    story: "Tempo Nord designs every dial in Copenhagen. Mechanical and quartz movements are sourced from established makers; smartwatches run on our own privacy-first companion app.",
  },
  {
    slug: "fieldhouse-leather",
    name: "Fieldhouse Leather",
    description: "Bags, belts and small leather goods in full-grain, vegetable-tanned leather.",
    story: "Fieldhouse uses full-grain leather from Leather Working Group certified tanneries. Edges are burnished by hand and hardware is solid brass — built to be repaired, not replaced.",
  },
  {
    slug: "solis-eyewear",
    name: "Solis Eyewear",
    description: "Hand-polished acetate and titanium sunglasses with full UV400 protection.",
    story: "Solis frames are cut from bio-based acetate and lightweight titanium, then paired with polarised, scratch-resistant lenses that block 100% of UVA and UVB.",
  },
  {
    slug: "aural-lab",
    name: "Aural Lab",
    featured: true,
    description: "Audio and desk tech engineered for sound, comfort and repairability.",
    story: "Aural Lab tunes every product in-house and designs for the long run: replaceable ear pads and batteries, firmware updates for years, and a two-year warranty as standard.",
  },
  {
    slug: "hearth-and-form",
    name: "Hearth & Form",
    description: "Furniture, lighting and objects for calm, well-lived-in homes.",
    story: "Hearth & Form collaborates with independent designers and workshops on pieces that balance form and use — solid materials, honest construction and finishes that improve with age.",
  },
];

export type SeedCategory = {
  slug: string;
  name: string;
  description: string;
  photo?: string;
  children?: Array<{ slug: string; name: string; description: string }>;
};

export const CATEGORIES: SeedCategory[] = [
  {
    slug: "women",
    name: "Women",
    photo: "1539109136881-3be0616acf4b",
    description: "Dresses, tailoring, knitwear and shoes from labels that design for longevity.",
    children: [
      { slug: "womens-dresses", name: "Dresses", description: "Wrap, midi and evening dresses in natural fibres." },
      { slug: "womens-tops", name: "Tops & Shirts", description: "Blouses, shirts and tops for every day and evening." },
      { slug: "womens-coats-jackets", name: "Coats & Jackets", description: "Trench coats, tailoring and layering pieces." },
      { slug: "womens-skirts-shorts", name: "Skirts & Shorts", description: "Denim, tailored and easy summer staples." },
      { slug: "womens-loungewear", name: "Loungewear", description: "Soft sets for slow mornings and travel days." },
      { slug: "womens-shoes", name: "Shoes", description: "Heels, boots and sneakers." },
    ],
  },
  {
    slug: "men",
    name: "Men",
    photo: "1552374196-1ab2a1c593e8",
    description: "Tailoring, shirting and essentials made to be worn hard and kept for years.",
    children: [
      { slug: "mens-shirts", name: "Shirts", description: "Oxford, poplin and dress shirts." },
      { slug: "mens-tees-sweats", name: "T-Shirts & Sweats", description: "Heavyweight tees, crewnecks and hoodies." },
      { slug: "mens-trousers-denim", name: "Trousers & Denim", description: "Chinos, selvedge denim and tailored trousers." },
      { slug: "mens-tailoring-outerwear", name: "Tailoring & Outerwear", description: "Suits, blazers and jackets." },
      { slug: "mens-shoes", name: "Shoes", description: "Derbies, loafers, boots and sneakers." },
    ],
  },
  {
    slug: "kids",
    name: "Kids",
    photo: "1519457431-44ccd64a579b",
    description: "Hard-wearing clothing and heirloom toys for babies and children.",
    children: [
      { slug: "baby", name: "Baby", description: "Soft essentials for 0–18 months." },
      { slug: "girls", name: "Girls", description: "Dresses, denim and layers for ages 2–8." },
      { slug: "boys", name: "Boys", description: "Knitwear, jackets and sets for ages 2–8." },
      { slug: "toys", name: "Toys", description: "Wooden toys and open-ended play." },
    ],
  },
  {
    slug: "beauty",
    name: "Beauty",
    photo: "1596462502278-27bfdc403348",
    description: "Skincare and colour with transparent, effective formulas.",
    children: [
      { slug: "skincare", name: "Skincare", description: "Serums, oils and moisturisers." },
      { slug: "makeup", name: "Makeup", description: "Palettes, brushes and colour." },
      { slug: "nails", name: "Nails", description: "Long-wear lacquers and at-home kits." },
    ],
  },
  {
    slug: "watches",
    name: "Watches",
    photo: "1533139502658-0198f920d8e8",
    description: "Dress watches, automatics and smartwatches.",
    children: [
      { slug: "analog-watches", name: "Analog Watches", description: "Quartz and automatic watches." },
      { slug: "smartwatches", name: "Smartwatches", description: "Health, fitness and notifications on your wrist." },
    ],
  },
  {
    slug: "jewellery",
    name: "Jewellery",
    photo: "1506630448388-4e683c67ddb0",
    description: "Recycled gold, sterling silver and responsibly sourced stones.",
    children: [
      { slug: "necklaces", name: "Necklaces", description: "Pendants, pearls and layering chains." },
      { slug: "earrings", name: "Earrings", description: "Hoops, drops and studs." },
      { slug: "bracelets", name: "Bracelets", description: "Chains, bangles and tennis bracelets." },
      { slug: "rings", name: "Rings", description: "Solitaires and stacking rings." },
    ],
  },
  {
    slug: "bags-accessories",
    name: "Bags & Accessories",
    photo: "1594223274512-ad4803739b7c",
    description: "Leather bags, sunglasses and the finishing touches.",
    children: [
      { slug: "handbags", name: "Handbags", description: "Top-handle bags, totes and crossbodies." },
      { slug: "backpacks", name: "Backpacks", description: "Leather, canvas and commuter backpacks." },
      { slug: "sunglasses", name: "Sunglasses", description: "Acetate and titanium frames with UV400 lenses." },
      { slug: "small-leather-goods", name: "Small Leather Goods", description: "Wallets, belts and card holders." },
      { slug: "hats", name: "Hats", description: "Caps and everyday headwear." },
    ],
  },
  {
    slug: "tech",
    name: "Tech",
    photo: "1505740420928-5e560c06d30e",
    description: "Headphones, earbuds and wearables engineered to last.",
    children: [
      { slug: "headphones", name: "Headphones", description: "Over-ear wireless and studio headphones." },
      { slug: "earbuds", name: "Earbuds", description: "True wireless earbuds." },
    ],
  },
  {
    slug: "home",
    name: "Home",
    photo: "1618220179428-22790b461013",
    description: "Furniture, lighting, tableware and textiles.",
    children: [
      { slug: "furniture", name: "Furniture", description: "Sofas, lounge chairs and dining chairs." },
      { slug: "lighting", name: "Lighting", description: "Pendants and floor lamps." },
      { slug: "tableware", name: "Tableware", description: "Stoneware and porcelain for everyday use." },
      { slug: "bedding", name: "Bedding", description: "Pillows and bed textiles." },
      { slug: "candles", name: "Candles & Fragrance", description: "Wood-wick and soy candles." },
    ],
  },
];

export const COLLECTIONS = [
  { slug: "new-arrivals", name: "New Arrivals", rule: "NEW_ARRIVALS", description: "The latest additions across every department." },
  { slug: "best-sellers", name: "Best Sellers", rule: "BEST_SELLERS", description: "What customers are buying most right now." },
  { slug: "sale", name: "Sale", rule: "ON_SALE", description: "Limited-time prices on pieces from across the store." },
  { slug: "editors-picks", name: "Editors’ Picks", rule: "FEATURED", description: "The pieces our buying team is most excited about this season." },
  { slug: "top-rated", name: "Top Rated", rule: "TOP_RATED", description: "Highest-rated by verified customers." },
  { slug: "the-gift-edit", name: "The Gift Edit", rule: "MANUAL", description: "Thoughtful gifts for everyone on your list." },
] as const;
