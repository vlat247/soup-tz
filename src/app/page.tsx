import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/runs/run-001");
}
