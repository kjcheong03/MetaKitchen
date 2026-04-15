import { NextResponse } from "next/server";

export async function POST() {
  const faceId = process.env.SIMLI_FACE_ID!;
  const apiKey = process.env.SIMLI_API_KEY!;

  const res = await fetch("https://api.simli.ai/compose/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-simli-api-key": apiKey,
    },
    body: JSON.stringify({
      faceId,
      apiVersion: "v2",
      handleSilence: true,
      maxSessionLength: 600,
      maxIdleTime: 180,
    }),
  });

  const data = await res.json() as { session_token: string; detail?: string };

  if (!res.ok) {
    return NextResponse.json(
      { error: data.detail ?? "Failed to get session token" },
      { status: res.status }
    );
  }

  return NextResponse.json({ session_token: data.session_token });
}
