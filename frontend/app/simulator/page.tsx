import type { Metadata } from "next";
import { SimulatorShell } from "@/components/simulator/SimulatorShell";

export const metadata: Metadata = {
  title: "Simulator - Sylvida",
  description:
    "Inspect need, place infrastructure, generate a configuration and compare the trade-offs.",
};

export default function SimulatorPage() {
  return <SimulatorShell />;
}
