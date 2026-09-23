"use client";

import { useLightbox } from "./ProfileLightbox";
import ProfileClient from "./ProfileClient";
import ProfileSections from "./ProfileSections";
import ProfileCoverActions from "./ProfileCoverActions";
import { LightboxContent } from "./ProfileLightbox";

interface ProfilePageClientProps {
  userFull: {
    id: number;
    name: string;
    email: string;
    role: "admin" | "photographer" | "buyer";
    avatarUrl: string | null;
    coverImage: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    phone: string | null;
    country: string | null;
    specialties: string | null;
    interests: string | null;
    instagram: string | null;
    donationLink: string | null;
    payoutMethod: string | null;
    payoutAccount: string | null;
    payoutName: string | null;
    availableBalance: string;
    createdAt: string | Date;
  };
  stats: {
    photoCount: number;
    views: number;
    likes: number;
    downloads: number;
    featured: number;
  } | null;
  payouts: Array<{
    id: number;
    reference: string;
    amount: string;
    method: string;
    account_name: string | null;
    status: string;
    created_at: Date;
  }>;
  myPhotos: any[];
  collections: any[];
  isCreator: boolean;
}

export default function ProfilePageClient({
  userFull,
  stats,
  payouts,
  myPhotos,
  collections,
  isCreator,
}: ProfilePageClientProps) {
  const { openLightbox } = useLightbox();
  const coverImage = userFull.coverImage;
  const avatarUrl = userFull.avatarUrl;

  return (
    <div className="container py-4" style={{ maxWidth: 1100 }}>
      <div
        className="relative profile-cover cursor-zoom-in"
        style={coverImage ? { backgroundImage: `url(${coverImage})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
        onClick={() => coverImage && openLightbox("cover")}
      >
        {coverImage ? (
          <div className="profile-cover-overlay" />
        ) : (
          <div className="profile-cover-pattern" />
        )}
        <ProfileCoverActions coverImage={coverImage} />
      </div>

      <ProfileClient
        user={{
          ...userFull,
          createdAt: typeof userFull.createdAt === "string" ? userFull.createdAt : userFull.createdAt.toISOString(),
        }}
        stats={stats ? {
          photoCount: stats.photoCount,
          views: stats.views,
          likes: stats.likes,
        } : undefined}
        onAvatarClick={() => avatarUrl && openLightbox("avatar")}
      />

      <ProfileSections
        isCreator={isCreator}
        availableBalance={userFull.availableBalance}
        downloads={stats?.downloads ?? 0}
        featured={stats?.featured ?? 0}
        payouts={payouts}
        myPhotos={myPhotos}
        collections={collections}
      />

      <LightboxContent avatarUrl={avatarUrl} coverImage={coverImage} userName={userFull.name} />
    </div>
  );
}