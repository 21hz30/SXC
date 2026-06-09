import { requireStaff } from "@/lib/auth";
import { generateCustomerInsights } from "@/domain/insights";

// Generate AI coaching insights for one customer, on demand. Staff only.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  try {
    const { insights, model } = await generateCustomerInsights(id);
    return Response.json({ insights, model, generatedAt: new Date().toISOString() });
  } catch (e) {
    return Response.json({ error: (e as Error).message || "Failed to generate insights" }, { status: 500 });
  }
}
