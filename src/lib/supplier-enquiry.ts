import { z } from "zod";

// Shared between the supplier form (client) and the enquiry endpoint (server).

export const COMPANY_TYPES = [
  "Manufacturer",
  "Wholesaler",
  "Exporter",
  "Brand Owner",
  "Stockist",
  "Other",
] as const;

export const PRODUCT_CATEGORIES = [
  "Professional Cleaning & Hygiene",
  "Hardware & Technical Supplies",
  "Industrial & Maintenance Supplies",
  "Building & Renovation Supplies",
  "Home & Interior Products",
  "Hospitality & Catering Supplies",
  "Non-Food Consumer Goods",
  "General Wholesale Trading / Other",
] as const;

export const STOCK_OPTIONS = [
  "Available from stock",
  "Regular stock",
  "Production required",
  "Depends on quantity",
] as const;

export const ORDER_VALUE_OPTIONS = [
  "Below €25,000",
  "€25,000 – €50,000",
  "€50,000 – €100,000",
  "€100,000 – €250,000",
  "€250,000+",
] as const;

export const EXPORT_UAE_OPTIONS = ["Yes", "No", "Need to discuss"] as const;
export const YES_NO = ["Yes", "No"] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // per file
export const ACCEPTED_FILE_EXTENSIONS = [
  ".pdf",
  ".xls",
  ".xlsx",
  ".csv",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".zip",
  ".jpg",
  ".jpeg",
  ".png",
];
export const ACCEPT_ATTR = ACCEPTED_FILE_EXTENSIONS.join(",");

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().or(z.literal(""));

export const supplierEnquirySchema = z.object({
  companyName: z.string().trim().min(2, "Please enter your company name").max(160),
  country: z.string().trim().min(2, "Please enter your country").max(80),
  website: z
    .string()
    .trim()
    .min(4, "Please enter your company website")
    .max(200)
    .refine(
      (v) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(v),
      "Please enter a valid website address",
    ),
  contactPerson: z.string().trim().min(2, "Please enter a contact name").max(120),
  jobTitle: optionalText(120),
  email: z.string().trim().email("Please enter a valid business email").max(160),
  phone: z
    .string()
    .trim()
    .min(6, "Please enter a telephone or WhatsApp number")
    .max(40)
    .refine((v) => /^[+()\d\s.-]{6,}$/.test(v), "Please use digits, spaces and + only"),
  productCategory: z.enum(PRODUCT_CATEGORIES, { message: "Please select a product category" }),
  productBrands: optionalText(300),
  companyType: optionalEnum(COMPANY_TYPES),
  uaeDistributor: optionalEnum(YES_NO),
  exportMarkets: optionalText(300),
  moq: optionalText(200),
  leadTime: optionalText(200),
  stockAvailability: optionalEnum(STOCK_OPTIONS),
  orderValue: optionalEnum(ORDER_VALUE_OPTIONS),
  canExportUae: optionalEnum(EXPORT_UAE_OPTIONS),
  message: optionalText(4000),
});

export type SupplierEnquiry = z.infer<typeof supplierEnquirySchema>;

export const FIELD_LABELS: Record<keyof SupplierEnquiry, string> = {
  companyName: "Company Name",
  country: "Country",
  website: "Company Website",
  contactPerson: "Contact Person",
  jobTitle: "Job Title",
  email: "Business Email",
  phone: "Telephone / WhatsApp",
  productCategory: "Product Category",
  productBrands: "Product / Brand Names",
  companyType: "Company Type",
  uaeDistributor: "Existing UAE Distributor?",
  exportMarkets: "Current Export Markets",
  moq: "MOQ",
  leadTime: "Typical Order Lead Time",
  stockAvailability: "Current Stock Availability",
  orderValue: "Indicative Wholesale Order Value",
  canExportUae: "Can you export to the UAE?",
  message: "Message",
};

export function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_FILE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return "Accepted formats: PDF, Excel, CSV, Word, PowerPoint, ZIP, JPG or PNG";
  }
  if (file.size > MAX_FILE_BYTES) return "Each file must be 10 MB or smaller";
  return null;
}
