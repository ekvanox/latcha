import { NextResponse } from "next/server";
import { listGenerationVisualizations } from "../../../lib/generations";

export interface CaptchaTestItem {
  challengeId: string;
  imageUuid: string;
  generationType: string;
  question: string;
  answerAlternatives: string[];
  correctAlternative: string;
  imageUrl: string;
}

export async function GET() {
  try {
    const items = await listGenerationVisualizations(10_000);
    const testItems: CaptchaTestItem[] = items.map((item) => ({
      challengeId: item.challengeId,
      imageUuid: item.imageUuid,
      generationType: item.generationType,
      question: item.question,
      answerAlternatives: item.answerAlternatives,
      correctAlternative: item.correctAlternative,
      imageUrl: `/api/generations/image/${item.generationType}/${item.imageUuid}`,
    }));

    return NextResponse.json({ items: testItems, count: testItems.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
