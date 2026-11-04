import { redirect } from "next/navigation";

// /settings has no content of its own — profile is the landing section. Redirect
// there so the route is still addressable and the sub-nav shows a sensible
// active item. (A server redirect avoids a client flash of empty content.)
export default function SettingsIndexPage() {
  redirect("/settings/profile");
}
