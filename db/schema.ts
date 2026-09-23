import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  numeric,
  jsonb,
  index,
  primaryKey,
  uniqueIndex,
  uuid,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/*  Lifecycle constants (TS-level enums — the columns are plain text)  */
/* ------------------------------------------------------------------ */

/** Order lifecycle statuses, in business order. `refund_pending` marks an
 *  order whose payment succeeded but whose fulfilment is impossible (stock
 *  exhausted, collision, amount mismatch…) : the buyer must be reimbursed.
 *  `refunded` is terminal — the Stripe refund (or operator refund) is done. */
export const ORDER_STATUS = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
  "refund_pending",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

/** Canonical reasons recorded in `orders.refund_reason` when an order moves
 *  to `refund_pending`. Not a database constraint — free-form text allowed. */
export const REFUND_REASONS = [
  "stock_exhausted",
  "edition_collision",
  "edition_counter_invalid",
  "photo_unavailable",
  "amount_mismatch",
  "currency_mismatch",
  "order_cancelled_after_payment",
  "finalization_failed",
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** Wallet ledger movement types. `clawback` debits a photographer's balance
 *  when a finalized order is later refunded (money already credited). */
export const WALLET_TX_TYPES = ["deposit", "payout", "purchase", "clawback"] as const;
export type WalletTxType = (typeof WALLET_TX_TYPES)[number];

/** Lifecycle of a recorded webhook delivery. `received` = accepted but not
 *  yet fully processed (a later replay may retry). `processed` = handled to
 *  a terminal state. `unmatched` = the referenced order was not found. */
export const WEBHOOK_EVENT_STATUS = ["received", "processed", "unmatched"] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUS)[number];

/* ------------------------------------------------------------------ */
/*  users — roles (admin / photographer / buyer) + extended profile    */
/* ------------------------------------------------------------------ */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "photographer", "buyer"] })
    .notNull()
    .default("buyer"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  coverImage: text("cover_image"),
  location: text("location"),
  website: text("website"),
  donationLink: text("donation_link"),
  instagram: text("instagram"),
  /* Extended onboarding fields */
  phone: text("phone"),
  country: text("country"),
  specialties: text("specialties"),
  interests: text("interests"),
  payoutMethod: text("payout_method"),
  payoutAccount: text("payout_account"),
  payoutName: text("payout_name"),
  payoutEnabled: boolean("payout_enabled").notNull().default(false),
  availableBalance: numeric("available_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailVerifications = pgTable("email_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResets = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  auth_attempts — rate limiting (I2).                                */
/*  Row-keyed by (scope, key); the clock is the DATABASE's now().      */
/* ------------------------------------------------------------------ */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("auth_attempts_scope_key_idx").on(t.scope, t.key)],
);

/* ------------------------------------------------------------------ */
/*  categories & tags                                                  */
/* ------------------------------------------------------------------ */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  kind: text("kind", { enum: ["stock", "art", "both"] }).notNull().default("both"),
  icon: text("icon").notNull().default("bi-image"),
  coverUrl: text("cover_url"),
  sort: integer("sort").notNull().default(0),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const photoTags = pgTable(
  "photo_tags",
  {
    photoId: integer("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.photoId, t.tagId] })],
);

/* ------------------------------------------------------------------ */
/*  photos                                                             */
/* ------------------------------------------------------------------ */
export const photos = pgTable(
  "photos",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    imageUrl: text("image_url").notNull(),
    thumbUrl: text("thumb_url"),
    /** Private path of the original high-resolution source file (never in /public). */
    hdPath: text("hd_path"),
    hdMime: text("hd_mime"),
    hdSize: integer("hd_size"),
    width: integer("width"),
    height: integer("height"),
    orientation: text("orientation", { enum: ["landscape", "portrait", "square"] }).notNull(),
    color: text("color"),
    licenseType: text("license_type", { enum: ["free", "limited"] }).notNull(),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    photographerId: integer("photographer_id").notNull().references(() => users.id),
    basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull().default("0"),
    totalEditions: integer("total_editions"),
    availableStock: integer("available_stock"),
    exif: jsonb("exif"),
    downloads: integer("downloads").notNull().default(0),
    views: integer("views").notNull().default(0),
    likesCount: integer("likes_count").notNull().default(0),
    featured: boolean("featured").notNull().default(false),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("photos_license_idx").on(t.licenseType),
    index("photos_category_idx").on(t.categoryId),
    index("photos_orientation_idx").on(t.orientation),
    index("photos_color_idx").on(t.color),
    index("photos_featured_idx").on(t.featured),
    index("photos_photographer_idx").on(t.photographerId),
    /* Un stock disponible ne peut jamais dépasser la taille de l'édition
     * (et ne peut exister sans taille d'édition configurée) : sinon la
     * formule `numéro = total_editions - available_stock` produirait des
     * numéros ≤ 0. `available_stock` NULL = tirage illimité. */
    check(
      "photos_edition_bounds",
      sql`(available_stock IS NULL) OR (total_editions IS NOT NULL AND available_stock >= 0 AND available_stock <= total_editions)`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/*  prints config                                                      */
/* ------------------------------------------------------------------ */
export const printsConfig = pgTable("prints_config", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  widthCm: integer("width_cm").notNull(),
  heightCm: integer("height_cm").notNull(),
  multiplier: numeric("multiplier", { precision: 6, scale: 3 }).notNull().default("1"),
  sort: integer("sort").notNull().default(0),
});

export const mounts = pgTable("mounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  multiplier: numeric("multiplier", { precision: 6, scale: 3 }).notNull().default("1"),
  surcharge: numeric("surcharge", { precision: 10, scale: 2 }).notNull().default("0"),
  sort: integer("sort").notNull().default(0),
});

/* ------------------------------------------------------------------ */
/*  collections                                                        */
/* ------------------------------------------------------------------ */
export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collectionPhotos = pgTable(
  "collection_photos",
  {
    collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    photoId: integer("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.photoId] })],
);

export const likes = pgTable(
  "likes",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    photoId: integer("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.photoId] })],
);

/* ------------------------------------------------------------------ */
/*  orders & order_items                                               */
/* ------------------------------------------------------------------ */
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull().unique(),
    userId: integer("user_id").notNull().references(() => users.id),
    status: text("status", { enum: ORDER_STATUS }).notNull().default("pending"),
    /** Distinguishes physical print orders from digital HD license orders. */
    kind: text("kind", { enum: ["print", "digital"] }).notNull().default("print"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    shipping: numeric("shipping", { precision: 10, scale: 2 }).notNull().default("0"),
    tax: numeric("tax", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("EUR"),
    paymentMethod: text("payment_method"),
    paymentProvider: text("payment_provider"),
    paymentRef: text("payment_ref"),
    /** Expected gateway amount (smallest currency unit) + currency, recorded
      *  at checkout creation so the confirmation webhook can re-validate the
      *  amount actually charged (never trusts the session blindly). */
    expectedAmountMinor: integer("expected_amount_minor"),
    expectedCurrency: text("expected_currency"),
    /** Refund bookkeeping — set when the order moves to `refund_pending`. */
    refundReason: text("refund_reason"),
    refundId: text("refund_id"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    /** Set when Stripe reports a dispute on this order's charge. */
    disputedAt: timestamp("disputed_at", { withTimezone: true }),
    /** Client-supplied UUID (Idempotency-Key header) that makes a wallet
     *  checkout retry-safe: at most ONE order per (user, key). */
    idempotencyKey: text("idempotency_key"),
    shipName: text("ship_name"),
    shipEmail: text("ship_email"),
    shipAddress: jsonb("ship_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /* Un seul ordre par (utilisateur, clé d'idempotence) : une clé réutilisée
     * rejoue sur l'ordre existant au lieu de créer un doublon / re-débiter. */
    uniqueIndex("orders_user_idempotency_key_idx")
      .on(t.userId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  photoId: integer("photo_id").notNull().references(() => photos.id),
  printConfigId: integer("print_config_id").references(() => printsConfig.id),
  mountId: integer("mount_id").references(() => mounts.id),
  editionNumber: integer("edition_number"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 10, scale: 2 }).notNull(),
  /** Amount actually credited to the photographer's available balance for this line (audit trail) */
  photographerShare: numeric("photographer_share", { precision: 10, scale: 2 }),
  /** Digital HD license type for digital orders (null for physical prints). */
  licenseType: text("license_type", { enum: ["commercial", "personal"] }),
  },
  (t) => [
    /* Un numéro d'édition n'est JAMAIS attribué deux fois à la même photo.
     * Il est calculé à la finalisation (stock post-décrément, sous verrou de
     * ligne) et écrit ici : la course du checkout ne peut donc pas produire
     * de doublons, même sous requêtes concurrentes. Ordres "pending" : NULL. */
    uniqueIndex("order_items_photo_edition_idx")
      .on(t.photoId, t.editionNumber)
      .where(sql`${t.editionNumber} IS NOT NULL`),
  ],
);

/* ------------------------------------------------------------------ */
/*  certificates                                                       */
/* ------------------------------------------------------------------ */
export const certificates = pgTable("certificates", {
  id: serial("id").primaryKey(),
  orderItemId: integer("order_item_id")
    .notNull()
    .unique()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  photoId: integer("photo_id").notNull().references(() => photos.id),
  serialNumber: text("serial_number").notNull().unique(),
  watermarkHash: text("watermark_hash").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  /** Non-null when the certificate was revoked (order refunded / dispute lost). */
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/*  entitlements — digital HD license grants (buyer → photo)           */
/* ------------------------------------------------------------------ */
export const entitlements = pgTable(
  "entitlements",
  {
    id: serial("id").primaryKey(),
    /** Buyer who acquired the digital license. */
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    photoId: integer("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    /** The completed order that granted this entitlement. */
    orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    licenseType: text("license_type", { enum: ["commercial", "personal"] })
      .notNull()
      .default("personal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entitlements_user_photo_idx").on(t.userId, t.photoId)],
);

/* ------------------------------------------------------------------ */
/*  comments on photos                                                 */
/* ------------------------------------------------------------------ */
export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    photoId: integer("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_photo_idx").on(t.photoId)],
);

/* ------------------------------------------------------------------ */
/*  bookmarks (saved photos)                                           */
/* ------------------------------------------------------------------ */
export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    photoId: integer("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.photoId] })],
);

/* ------------------------------------------------------------------ */
/*  shares (track how many times a photo was shared)                  */
/* ------------------------------------------------------------------ */
export const shares = pgTable(
  "shares",
  {
    id: serial("id").primaryKey(),
    photoId: integer("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    platform: text("platform"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shares_photo_idx").on(t.photoId)],
);

/* ------------------------------------------------------------------ */
/*  payouts — withdrawals for photographers                            */
/* ------------------------------------------------------------------ */
export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  reference: text("reference").notNull().unique(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull(),
  account: text("account").notNull(),
  accountName: text("account_name"),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
    .notNull()
    .default("pending"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  wallet_transactions — unified ledger of balance movements           */
/* ------------------------------------------------------------------ */
/*  Every user (buyer or photographer) has an `available_balance` on the
 *  `users` row. This ledger records each movement on it:
 *    - deposit   (+) money added by the user (card via Stripe / Mobile Money)
 *    - payout    (−) earnings withdrawn by a photographer
 *    - purchase  (−) money spent by a buyer on an order
 *  Amounts are canonical EUR (same convention as orders). Deposits are
 *  credited to the balance only once the payment is genuinely confirmed
 *  (Stripe webhook / Mobile Money callback / admin reconciliation).
 */
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** User-facing reference (e.g. "WLD-2026-482913"), used in Stripe
      *  client_reference_id, USSD instructions and webhook matching. */
    reference: text("reference").notNull().unique(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    type: text("type", { enum: WALLET_TX_TYPES }).notNull().default("deposit"),
    status: text("status", { enum: ["pending", "completed", "failed"] })
      .notNull()
      .default("pending"),
    paymentMethod: text("payment_method", {
      enum: ["stripe", "orange_money", "mvola", "airtel_money"],
    }).notNull(),
    /** Reference given by the payment provider (Stripe session, MVola
      *  correlation id, Orange pay token…). */
    transactionReference: text("transaction_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wallet_transactions_user_idx").on(t.userId),
    index("wallet_transactions_status_idx").on(t.status),
    index("wallet_transactions_created_idx").on(t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/*  webhook_events — deduplicated audit log of payment callbacks        */
/* ------------------------------------------------------------------ */
/*  Every processed payment notification (Stripe event, Orange/MVola/    */
/*  Airtel callback) is recorded here BEFORE any side effect. The unique  */
/*  (provider, event_id) key makes a webhook replay a harmless no-op.     */
/*  Signature verification happens BEFORE this row is ever created.       */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: serial("id").primaryKey(),
    /** Provider namespace. Stripe uses real event ids; Mobile Money uses a
      *  synthesized id `${provider}:${reference}:${status}`. */
    provider: text("provider", {
      enum: ["stripe", "orange_money", "mvola", "airtel_money"],
    }).notNull(),
    eventId: text("event_id").notNull(),
    status: text("status", { enum: WEBHOOK_EVENT_STATUS })
      .notNull()
      .default("received"),
    /** Linked order when one could be resolved (null for orphan events). */
    orderNumber: text("order_number"),
    /** Raw event payload, for audit / replay diagnosis. */
    payload: jsonb("payload"),
    /** Non-null when the last handling attempt failed with a 5xx. */
    error: text("error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_key").on(t.provider, t.eventId),
  ],
);
