import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioFile = formData.get("audio") as File;
  const languageCode = (formData.get("language_code") as string | null) ?? "en-IN";

  if (!audioFile) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }

  const sarvamForm = new FormData();
  sarvamForm.append("file", audioFile, "recording.wav");
  sarvamForm.append("model", "saarika:v2.5");
  sarvamForm.append("language_code", languageCode);

  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY! },
    body: sarvamForm,
  });

  const responseText = await res.text();
  if (!res.ok) {
    console.error("[STT] Sarvam error:", responseText);
    return NextResponse.json({ error: responseText }, { status: res.status });
  }

  const data = JSON.parse(responseText) as { transcript: string };
  return NextResponse.json({ transcript: data.transcript });
}
