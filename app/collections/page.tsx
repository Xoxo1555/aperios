import { getSessionUser } from "lib/auth";
import { fetchMyCollections } from "lib/queries";
import CollectionsView from "./CollectionsView";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Collections" };

export default async function CollectionsPage() {
  const user = await getSessionUser();
  const collections = user ? await fetchMyCollections(user.id) : [];

  return <CollectionsView collections={collections} />;
}