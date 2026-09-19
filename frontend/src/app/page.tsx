import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FoundationCheck } from "@/components/foundation-check";
import { getSupabaseConfig } from "@/lib/env";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-4">
        <Badge variant="outline">Foundation · 0.1</Badge>
        <h1 className="text-4xl font-semibold tracking-tight">Prayas</h1>
        <p className="max-w-lg text-muted-foreground">The foundation for your planning app. Product screens, data layers, and optimisation will come next.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Connection checks</CardTitle>
          <CardDescription>Start the Python API to check the frontend connection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">Supabase: {getSupabaseConfig() ? "environment configured; connectivity not yet verified" : "add your project URL and publishable key"}.</p>
          <FoundationCheck />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Setup guide: docs/SETUP.md · API documentation: port 8000/docs</p>
    </main>
  );
}
