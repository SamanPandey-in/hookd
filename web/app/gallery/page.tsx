import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GalleryClient } from "./gallery-client";

// Dev-only component gallery: every base component in all states, so the look
// can be reviewed at a glance. Hidden in production builds.
export const metadata: Metadata = {
  title: "Component gallery",
  robots: { index: false, follow: false },
};

export default function GalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GalleryClient />;
}
