// Single source of truth for the public AL NOKHBA TRADING website.
// Only verified company facts belong here — never add invented figures,
// partners, certifications or claims.

export const SITE_URL = "https://alnokhbatrading.com";

export const COMPANY = {
  brand: "AL NOKHBA TRADING",
  legalName: "AL NOKHBA AL MASIYA GOODS WHOLESALERS L.L.C",
  domain: "alnokhbatrading.com",
  email: "Manager@alnokhbatrading.com",
  phoneDisplay: "+971 56 107 0471",
  phoneE164: "+971561070471",
  whatsappNumber: "971561070471",
  addressLine1: "SaiH Shuaib 3, Plot 13",
  city: "Dubai",
  country: "United Arab Emirates",
  countryCode: "AE",
  licenceNo: "1408620",
  activity: "Goods Wholesalers",
  tagline: "GLOBAL SOURCING • UAE WHOLESALE",
} as const;

export const CONTACT_LINKS = {
  email: `mailto:${COMPANY.email}`,
  emailProcurement: `mailto:${COMPANY.email}?subject=${encodeURIComponent("Procurement enquiry — AL NOKHBA TRADING")}`,
  emailMeeting: `mailto:${COMPANY.email}?subject=${encodeURIComponent("Business meeting request — AL NOKHBA TRADING")}&body=${encodeURIComponent(
    "Company:\nContact person:\nProduct category:\nProposed meeting location (office / showroom / warehouse / factory):\nPreferred dates:\n",
  )}`,
  emailSupplierRelations: `mailto:${COMPANY.email}?subject=${encodeURIComponent("Supplier relations — AL NOKHBA TRADING")}`,
  emailGeneral: `mailto:${COMPANY.email}?subject=${encodeURIComponent("General enquiry — AL NOKHBA TRADING")}`,
  tel: `tel:${COMPANY.phoneE164}`,
  whatsapp: `https://wa.me/${COMPANY.whatsappNumber}?text=${encodeURIComponent(
    "Hello AL NOKHBA TRADING, I would like to discuss a wholesale supply opportunity.",
  )}`,
} as const;

export const NAV = [
  { label: "Company", to: "/about" },
  { label: "Sectors", to: "/trading-sectors" },
  { label: "Sourcing", to: "/international-sourcing" },
  { label: "Procurement", to: "/wholesale-procurement" },
  { label: "Suppliers", to: "/become-a-supplier" },
  { label: "Contact", to: "/contact" },
] as const;

export type SitePath =
  | "/"
  | "/about"
  | "/trading-sectors"
  | "/international-sourcing"
  | "/wholesale-procurement"
  | "/become-a-supplier"
  | "/contact"
  | "/privacy-policy"
  | "/terms-and-conditions";

/* ------------------------------------------------------------------ */
/* Photography                                                         */
/* ------------------------------------------------------------------ */
// Royalty-free photography served from the Unsplash CDN (Unsplash License).
// To use your own photography, replace the `id`/`src` values here — every
// page reads images from this map.

export type SiteImageDef = { src: string; alt: string };

const unsplash = (id: string) => `https://images.unsplash.com/${id}`;

export const IMAGES = {
  warehouse: {
    src: unsplash("photo-1586528116311-ad8dd3c8310d"),
    alt: "Organised warehouse racking with palletised commercial goods",
  },
  warehouseAisle: {
    src: unsplash("photo-1553413077-190dd305871c"),
    alt: "Warehouse aisle stocked with boxed wholesale goods",
  },
  containers: {
    src: unsplash("photo-1494412574643-ff11b0a5c1c3"),
    alt: "Stacked shipping containers at an international cargo terminal",
  },
  containerShip: {
    src: unsplash("photo-1578575437130-527eed3abbec"),
    alt: "Container vessel carrying international cargo",
  },
  cleaning: {
    src: unsplash("photo-1563453392212-326f5e854473"),
    alt: "Professional cleaning and hygiene supplies",
  },
  tools: {
    src: unsplash("photo-1504148455328-c376907d081c"),
    alt: "Hardware tools and technical supplies arranged on a workshop wall",
  },
  industrial: {
    src: unsplash("photo-1504328345606-18bbc8c9d7d1"),
    alt: "Industrial workshop and maintenance activity",
  },
  factory: {
    src: unsplash("photo-1513828583688-c52646db42da"),
    alt: "European industrial manufacturing facility",
  },
  building: {
    src: unsplash("photo-1503387762-592deb58ef4e"),
    alt: "Building and renovation plans with technical drawing tools",
  },
  interior: {
    src: unsplash("photo-1586023492125-27b2c045efd7"),
    alt: "Contemporary home interior with furniture and decorative products",
  },
  hospitality: {
    src: unsplash("photo-1555396273-367ea4eb4db5"),
    alt: "Hospitality venue interior with catering and dining supplies",
  },
} satisfies Record<string, SiteImageDef>;

/* ------------------------------------------------------------------ */
/* Trading sectors                                                     */
/* ------------------------------------------------------------------ */

export type Sector = {
  no: string;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  examples: string[];
  image: SiteImageDef;
};

export const SECTORS: Sector[] = [
  {
    no: "01",
    slug: "cleaning-hygiene",
    title: "Professional Cleaning & Hygiene",
    shortTitle: "Professional Cleaning & Hygiene",
    description:
      "Professional cleaning products, janitorial supplies, cleaning equipment, hygiene products and related commercial consumables.",
    examples: [
      "Cleaning chemicals",
      "Janitorial supplies",
      "Cleaning equipment",
      "Hygiene consumables",
    ],
    image: IMAGES.cleaning,
  },
  {
    no: "02",
    slug: "hardware-technical",
    title: "Hardware & Technical Supplies",
    shortTitle: "Hardware & Technical Supplies",
    description:
      "Hardware products, tools, technical accessories, maintenance products and general commercial supplies.",
    examples: [
      "Hand & power tools",
      "Technical accessories",
      "Fixings & fasteners",
      "Maintenance products",
    ],
    image: IMAGES.tools,
  },
  {
    no: "03",
    slug: "industrial-maintenance",
    title: "Industrial & Maintenance Supplies",
    shortTitle: "Industrial & Maintenance",
    description:
      "Industrial consumables, maintenance supplies, workshop products and supporting equipment.",
    examples: [
      "Industrial consumables",
      "Workshop products",
      "Maintenance supplies",
      "Supporting equipment",
    ],
    image: IMAGES.industrial,
  },
  {
    no: "04",
    slug: "building-renovation",
    title: "Building & Renovation Supplies",
    shortTitle: "Building & Renovation",
    description:
      "Selected building materials, renovation products, fittings, accessories and related wholesale products.",
    examples: ["Building materials", "Renovation products", "Fittings", "Accessories"],
    image: IMAGES.building,
  },
  {
    no: "05",
    slug: "home-interior",
    title: "Home & Interior Products",
    shortTitle: "Home & Interior",
    description:
      "Homeware, household accessories, interior products, decorative products and selected home supplies.",
    examples: ["Homeware", "Household accessories", "Interior products", "Decorative products"],
    image: IMAGES.interior,
  },
  {
    no: "06",
    slug: "hospitality-catering",
    title: "Hospitality & Catering Supplies",
    shortTitle: "Hospitality & Catering",
    description:
      "Professional supplies and consumables for hospitality, catering, commercial kitchens and related businesses.",
    examples: [
      "Catering supplies",
      "Commercial kitchen products",
      "Hospitality consumables",
      "Front-of-house supplies",
    ],
    image: IMAGES.hospitality,
  },
  {
    no: "07",
    slug: "non-food-consumer-goods",
    title: "Non-Food Consumer Goods",
    shortTitle: "Non-Food Consumer Goods",
    description: "Selected non-food consumer products suitable for wholesale distribution.",
    examples: [
      "Household non-food",
      "Personal care non-food",
      "Everyday consumer goods",
      "Seasonal ranges",
    ],
    image: IMAGES.warehouseAisle,
  },
  {
    no: "08",
    slug: "general-wholesale",
    title: "General Wholesale Trading",
    shortTitle: "General Wholesale Trading",
    description:
      "Commercially viable goods sourced according to market demand and wholesale opportunities.",
    examples: [
      "Demand-led sourcing",
      "Opportunity purchases",
      "Mixed palletised goods",
      "Container-scale orders",
    ],
    image: IMAGES.containers,
  },
];

/* ------------------------------------------------------------------ */
/* Sourcing process                                                    */
/* ------------------------------------------------------------------ */

export const SOURCING_STEPS = [
  {
    no: "01",
    title: "Supplier Identification",
    body: "Identification of manufacturers, wholesalers, exporters and stockists offering commercially suitable products.",
  },
  {
    no: "02",
    title: "Initial Discussion",
    body: "Introduction, product availability, export capability and commercial requirements.",
  },
  {
    no: "03",
    title: "Catalogue & Commercial Review",
    body: "Review of product range, wholesale pricing, MOQ, stock availability and commercial terms.",
  },
  {
    no: "04",
    title: "Product & Sample Evaluation",
    body: "Evaluation of selected products and samples where required.",
  },
  {
    no: "05",
    title: "Supplier Visit",
    body: "Where commercially appropriate, our management may visit the supplier's headquarters, showroom, factory or warehouse to evaluate products and discuss the potential cooperation directly.",
    highlight: true,
  },
  {
    no: "06",
    title: "Commercial Negotiation",
    body: "Final discussion regarding quantities, pricing, Incoterms, availability and payment conditions.",
  },
  {
    no: "07",
    title: "Purchase Order",
    body: "Formal wholesale purchase following commercial approval.",
  },
  {
    no: "08",
    title: "Export & UAE Import",
    body: "Coordination of export documentation, logistics and import into the United Arab Emirates.",
  },
  {
    no: "09",
    title: "Wholesale, B2B & Marketplace Distribution",
    body: "Following product entry and commercial evaluation, products are distributed through AL NOKHBA's wholesale, B2B and selected online marketplace channels — primarily within the UAE, with selected opportunities in GCC markets.",
  },
] as const;

/* ------------------------------------------------------------------ */
/* Territory & route to market                                         */
/* ------------------------------------------------------------------ */
// Conservative positioning: Dubai-based operations, UAE as the primary
// market, selected GCC opportunities. No offices, partners or rights are
// claimed outside the UAE.

export const PRIMARY_MARKET = "United Arab Emirates";
export const REGIONAL_FOCUS = "Selected GCC Markets";

export const GCC_MARKETS = [
  { name: "United Arab Emirates", role: "Primary market · Dubai base" },
  { name: "Saudi Arabia", role: "Selected opportunities" },
  { name: "Qatar", role: "Selected opportunities" },
  { name: "Kuwait", role: "Selected opportunities" },
  { name: "Bahrain", role: "Selected opportunities" },
  { name: "Oman", role: "Selected opportunities" },
] as const;

export const DISTRIBUTION_CHANNELS = [
  {
    no: "01",
    title: "Wholesale Distribution",
    body: "Supply of products in commercial quantities to businesses, traders and professional buyers within the UAE.",
  },
  {
    no: "02",
    title: "B2B Commercial Sales",
    body: "Direct sales to business customers through our commercial network and established market connections.",
  },
  {
    no: "03",
    title: "Online Marketplaces",
    body: "Selected consumer-facing products may also be distributed through established online marketplaces such as Amazon UAE and other appropriate UAE/GCC e-commerce channels, complementing our core wholesale and B2B activities.",
  },
  {
    no: "04",
    title: "GCC Opportunities",
    body: "Where commercially appropriate, selected products may be supplied to business customers and trading partners in GCC markets.",
  },
] as const;

export const SALES_CHANNEL_FLOWS = [
  { from: "Wholesale", to: "B2B Customers" },
  { from: "Commercial Network", to: "Professional Buyers" },
  { from: "Online Marketplaces", to: "UAE Consumers & Businesses" },
  { from: "Regional Trading Relationships", to: "Selected GCC Markets" },
] as const;

export const SUPPLY_CHAIN = [
  { title: "International Supplier", note: "Manufacturer, exporter, wholesaler or stockist" },
  { title: "AL NOKHBA Procurement", note: "Evaluation, negotiation & purchase order" },
  { title: "Export to UAE", note: "Export documentation & international logistics" },
  { title: "UAE Import", note: "Import into the United Arab Emirates" },
  {
    title: "Product Entry & Commercial Evaluation",
    note: "Requirements review & market positioning",
  },
  { title: "Wholesale / B2B / Marketplace Distribution", note: "Multi-channel route to market" },
  { title: "UAE & Selected GCC Markets", note: "Primary market: UAE", final: true },
] as const;

export const SUPPLIER_MARKET_CHANNELS = [
  "UAE Wholesale",
  "B2B Distribution",
  "Commercial Network",
  "Online Marketplaces",
  "Selected GCC Opportunities",
] as const;

export const COMPLIANCE_STATEMENTS = [
  "Products are sourced and distributed in accordance with applicable UAE trade, import and commercial requirements.",
  "Product-specific regulatory, labeling, conformity and import requirements are reviewed where applicable before commercial distribution.",
] as const;

/* ------------------------------------------------------------------ */
/* Procurement                                                         */
/* ------------------------------------------------------------------ */

export const PROCUREMENT_CAPABILITIES = [
  {
    title: "Bulk Procurement",
    body: "Commercial quantity purchasing from international suppliers.",
  },
  {
    title: "Stock-Based Purchasing",
    body: "Preference for established product ranges with practical commercial availability and reasonable supply timelines.",
  },
  {
    title: "Container & Pallet Orders",
    body: "Procurement can include palletised goods, consolidated shipments and container-scale orders depending on product category.",
  },
  {
    title: "European Sourcing",
    body: "Development of supplier relationships across established European markets.",
  },
  {
    title: "Supplier Evaluation",
    body: "Assessment of commercial terms, product quality, documentation and supply capabilities.",
  },
  {
    title: "Sample Review",
    body: "Product samples may be reviewed before significant purchasing commitments.",
  },
  {
    title: "Commercial Negotiation",
    body: "Direct B2B discussions regarding pricing, MOQ, Incoterms, payment terms and supply schedules.",
  },
  {
    title: "Import Coordination",
    body: "Coordination with suppliers and logistics providers for international shipments to the UAE.",
  },
] as const;

export const SUPPLY_CRITERIA = [
  "Established Product Range",
  "Reliable Availability",
  "Export Capability",
  "Commercial MOQ",
  "Competitive Wholesale Pricing",
  "Consistent Supply",
  "Documentation",
  "International Logistics Readiness",
] as const;

export const SUPPLIER_TYPES = [
  "Manufacturers",
  "European Wholesalers",
  "Exporters",
  "Brand Owners",
  "Stockists",
  "International Suppliers",
] as const;

export const WHAT_WE_LOOK_FOR = [
  {
    title: "Product Quality",
    body: "Products that meet the expectations of professional and commercial buyers.",
  },
  {
    title: "Reliable Stock Availability",
    body: "Established ranges that can be supplied consistently.",
  },
  {
    title: "Competitive Wholesale Pricing",
    body: "Pricing structures that support wholesale distribution.",
  },
  { title: "Export Capability", body: "Experience preparing goods and documents for export." },
  { title: "Commercial Quantities", body: "Ability to supply pallet and container-scale volumes." },
  {
    title: "Reasonable Lead Times",
    body: "Practical timelines from order confirmation to dispatch.",
  },
  {
    title: "Product Documentation",
    body: "Specifications, labelling and supporting product documents.",
  },
  {
    title: "Long-Term Supply Potential",
    body: "Interest in a continuing commercial relationship.",
  },
] as const;

/* ------------------------------------------------------------------ */
/* SEO                                                                 */
/* ------------------------------------------------------------------ */

export const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export function seo({
  title,
  description,
  path,
  ogTitle,
  ogDescription,
}: {
  title: string;
  description: string;
  path: SitePath;
  ogTitle?: string;
  ogDescription?: string;
}) {
  const url = `${SITE_URL}${path}`;
  const oTitle = ogTitle ?? title;
  const oDesc = ogDescription ?? description;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "author", content: COMPANY.legalName },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: COMPANY.brand },
      { property: "og:locale", content: "en_GB" },
      { property: "og:url", content: url },
      { property: "og:title", content: oTitle },
      { property: "og:description", content: oDesc },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: `${COMPANY.brand} — Global Sourcing. UAE Wholesale.` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: oTitle },
      { name: "twitter:description", content: oDesc },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: COMPANY.brand,
      legalName: COMPANY.legalName,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      email: COMPANY.email,
      telephone: COMPANY.phoneE164,
      address: {
        "@type": "PostalAddress",
        streetAddress: COMPANY.addressLine1,
        addressLocality: COMPANY.city,
        addressCountry: COMPANY.countryCode,
      },
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "procurement",
          email: COMPANY.email,
          telephone: COMPANY.phoneE164,
          areaServed: "AE",
          availableLanguage: ["English"],
        },
        {
          "@type": "ContactPoint",
          contactType: "supplier relations",
          email: COMPANY.email,
          telephone: COMPANY.phoneE164,
          availableLanguage: ["English"],
        },
      ],
    },
    {
      "@type": "WholesaleStore",
      "@id": `${SITE_URL}/#localbusiness`,
      name: COMPANY.brand,
      legalName: COMPANY.legalName,
      description:
        "Dubai-based goods wholesaler sourcing, purchasing and importing products from international suppliers for wholesale, B2B and selected marketplace distribution in the UAE, with selected opportunities in GCC markets.",
      url: SITE_URL,
      image: OG_IMAGE,
      email: COMPANY.email,
      telephone: COMPANY.phoneE164,
      parentOrganization: { "@id": `${SITE_URL}/#organization` },
      address: {
        "@type": "PostalAddress",
        streetAddress: COMPANY.addressLine1,
        addressLocality: COMPANY.city,
        addressCountry: COMPANY.countryCode,
      },
      areaServed: [
        { "@type": "Country", name: "United Arab Emirates" },
        { "@type": "Place", name: "Gulf Cooperation Council (GCC) markets" },
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: COMPANY.brand,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
  ],
};
