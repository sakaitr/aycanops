import { NextRequest, NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("x-seed-token");
    const expectedToken = process.env.SEED_TOKEN || "change-me-super-secret";

    if (token !== expectedToken) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz token" },
        { status: 403 }
      );
    }

    await seedDatabase();

    return NextResponse.json({
      ok: true,
      data: { message: "Seed tamamlandı" },
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}
