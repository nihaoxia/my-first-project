import { redirect } from "next/navigation";

import { getAppSession } from "@/lib/auth/app-session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession();
  if (!session) redirect("/login?next=%2Fadmin");
  if (session.role !== "ADMIN") redirect("/library?error=admin");
  return children;
}
