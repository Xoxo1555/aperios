import { z } from "zod";

/**
 * Strict Zod schemas used to validate + sanitize every mutating endpoint.
 * Nothing from the client is ever trusted: bodies and parameters are parsed,
 * trimmed, bounded in length and typed before reaching the database layer.
 */

export const emailSchema = z.email().trim().toLowerCase().max(255);
export const passwordSchema = z.string().min(8).max(128);
export const nameSchema = z.string().trim().min(2).max(80);
export const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v));

/* ---------------- Auth ---------------- */

export const loginSchema = z.object({
  action: z.literal("login"),
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const registerSchema = z.object({
  action: z.literal("register"),
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirm: z.string().min(1).max(128),
  role: z.enum(["photographer", "buyer"]).default("buyer"),
  phone: optionalText(32),
  country: optionalText(80),
  location: optionalText(120),
  specialties: optionalText(255),
  interests: optionalText(500),
});

/* ---------------- Profile ---------------- */

export const profileUpdateSchema = z.object({
  name: nameSchema.optional(),
  bio: optionalText(2000),
  location: optionalText(120),
  website: z.union([z.string().trim().url().max(300), z.literal(""), z.null()]).optional(),
  instagram: optionalText(100),
  phone: optionalText(32),
  country: optionalText(80),
  specialties: optionalText(255),
  interests: optionalText(500),
  payoutMethod: z
    .enum(["orange-money", "mvola", "airtel-money", "stripe", "bank-transfer", "paypal"])
    .nullable()
    .optional(),
  payoutAccount: optionalText(255),
  payoutName: optionalText(160),
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema.optional(),
  email: emailSchema.optional(),
});

export const avatarUploadSchema = z.object({
  image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, "Format d'image non supporté"),
});

/* ---------------- Photos ---------------- */

export const photoCommentSchema = z.object({
  action: z.literal("comment"),
  message: z.string().trim().min(1).max(2000),
});

export const photoShareSchema = z.object({
  action: z.literal("share"),
  platform: z.string().trim().max(60).nullable().optional(),
});

export const photoIdParamSchema = z.coerce.number().int().positive();

export const photoPublishSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/* ---------------- Collections ---------------- */

export const collectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const collectionActionSchema = z.object({
  action: z.enum(["add", "remove"]),
  photoId: z.coerce.number().int().positive(),
});

/* ---------------- Payouts ---------------- */

export const payoutRequestSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
  method: z.enum(["orange-money", "mvola", "airtel-money", "stripe", "bank-transfer", "paypal"]),
  account: z.string().trim().min(3).max(255),
  accountName: z.string().trim().min(2).max(160),
});

export const payoutStatusSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
});

/* ---------------- Admin ---------------- */

export const adminUserRoleSchema = z.object({
  action: z.literal("updateUserRole"),
  userId: z.coerce.number().int().positive(),
  role: z.enum(["admin", "photographer", "buyer"]),
});

export const adminDeleteUserSchema = z.object({
  action: z.literal("deleteUser"),
  userId: z.coerce.number().int().positive(),
});

export const adminOrderStatusSchema = z.object({
  action: z.literal("updateOrderStatus"),
  orderId: z.coerce.number().int().positive(),
  status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]),
});

/* ---------------- Checkout ---------------- */

const checkoutLineSchema = z.object({
  photoId: z.coerce.number().int().positive(),
  sizeId: z.coerce.number().int().positive().nullable().optional(),
  mountId: z.coerce.number().int().positive().nullable().optional(),
  qty: z.coerce.number().int().min(1).max(10).default(1),
});

const shippingAddressSchema = z.record(z.string(), z.unknown()).optional();

export const checkoutSchema = z.object({
  items: z.array(checkoutLineSchema).min(1).max(50),
  shipName: z.string().trim().min(1).max(120),
  shipEmail: emailSchema,
  shipAddress: shippingAddressSchema,
  currency: z.enum(["EUR", "USD", "MGA"]).optional(),
});

export const mobileMoneyCheckoutSchema = checkoutSchema.extend({
  provider: z.enum(["orange-money", "mvola", "airtel-money"]),
  phone: z
    .string()
    .trim()
    .regex(
      /^(\+\d{1,3}[- ]?)?\d{9,15}$/,
      "Numéro de téléphone invalide. Format international attendu : +261 34 12 34 567 ou +1 555 123 4567"
    ),
});

/* ---------------- Digital HD license checkout ---------------- */

export const digitalLicenseSchema = z.object({
  photoId: z.coerce.number().int().positive(),
  licenseType: z.enum(["commercial", "personal"]).default("personal"),
  currency: z.enum(["EUR", "USD", "MGA"]).optional(),
});

/* ---------------- Certificates ---------------- */

export const certificateUpdateSchema = z.object({
  issuedAt: z.string().datetime({ offset: true }).optional(),
});

/* ---------------- Wallet (deposit / top-up) ---------------- */

export const walletDepositSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  paymentMethod: z.enum(["stripe", "orange_money", "mvola", "airtel_money"]),
  phone: z
    .string()
    .trim()
    .regex(
      /^(\+\d{1,3}[- ]?)?\d{9,15}$/,
      "Numéro de téléphone invalide. Format international attendu : +261 34 12 34 567 ou +1 555 123 4567"
    )
    .optional(),
  currency: z.enum(["EUR", "USD", "MGA"]).optional(),
});