import { AppShell } from "@/components/app-shell";
export const dynamicParams = false;
export function generateStaticParams() {
  return [
    "dashboard",
    "transactions",
    "accounts",
    "goals",
    "investments",
    "allocation",
    "analytics",
    "settings",
  ].map((section) => ({ section }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return <AppShell section={section} />;
}
