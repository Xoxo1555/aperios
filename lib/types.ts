/* Client-safe shared types (no server-only imports) */

export type Role = "admin" | "photographer" | "buyer";
export type LicenseType = "free" | "limited";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  coverImage: string | null;
  bio: string | null;
  location: string | null;
  donationLink: string | null;
  instagram: string | null;
}

export interface CategoryDto {
  id: number;
  name: string;
  slug: string;
  icon: string;
  kind: "stock" | "art" | "both";
  description: string | null;
  coverUrl: string | null;
}

export interface PhotographerDto {
  id: number;
  name: string;
  avatarUrl: string | null;
  location: string | null;
  bio: string | null;
  website: string | null;
  donationLink: string | null;
  instagram: string | null;
}

export interface PhotoDto {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  orientation: "landscape" | "portrait" | "square";
  color: string | null;
  licenseType: LicenseType;
  category: { id: number; name: string; slug: string; icon: string } | null;
  photographer: PhotographerDto;
  tags: Array<{ name: string; slug: string }>;
  basePrice: number;
  totalEditions: number | null;
  availableStock: number | null;
  downloads: number;
  views: number;
  likesCount: number;
  commentsCount: number;
  bookmarksCount: number;
  sharesCount: number;
  featured: boolean;
  /** Whether an original high-resolution source exists for this photo. */
  hasHd: boolean;
  exif: Record<string, unknown> | null;
  createdAt: string;
}

export interface PrintSizeDto {
  id: number;
  label: string;
  widthCm: number;
  heightCm: number;
  multiplier: number;
}

export interface MountDto {
  id: number;
  name: string;
  code: string;
  description: string | null;
  multiplier: number;
  surcharge: number;
}

export interface OrderItemDto {
  id: number;
  orderId: number;
  photoId: number;
  photoTitle: string;
  photoSlug: string;
  imageUrl: string;
  sizeLabel: string | null;
  mountName: string | null;
  editionNumber: number | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CollectionDto {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  isPublic: boolean;
  photoCount: number;
  coverUrl: string | null;
}

export type WalletTxType = "deposit" | "payout" | "purchase" | "clawback";
export type WalletTxStatus = "pending" | "completed" | "failed";
export type WalletPaymentMethod =
  | "stripe"
  | "orange_money"
  | "mvola"
  | "airtel_money";

/** Client-safe wallet ledger row (amounts are canonical EUR strings). */
export interface WalletTransactionDto {
  id: string;
  reference: string;
  amount: string;
  type: WalletTxType;
  status: WalletTxStatus;
  paymentMethod: WalletPaymentMethod;
  transactionReference: string | null;
  createdAt: string;
}
