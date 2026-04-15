import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { text, languageCode } = await req.json() as { text: string; languageCode?: string };

  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "api-subscription-key": process.env.SARVAM_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      target_language_code: languageCode ?? "en-IN",
      speaker: "shreya",
      model: "bulbul:v3",
      pace: 1.15,
      speech_sample_rate: 16000,
      output_audio_codec: "wav",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[TTS] Sarvam error:", err);
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const data = await res.json() as { audios: string[] };
  return NextResponse.json({ audio: data.audios[0] });
}
