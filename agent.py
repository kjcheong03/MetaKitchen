import logging
import os
import re

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    WorkerType,
    cli,
)
from livekit.plugins import google, sarvam, silero, simli

logger = logging.getLogger("health-companion")
logger.setLevel(logging.INFO)

load_dotenv(override=True)


def strip_markdown(text: str) -> str:
    # Remove bold/italic markers
    text = re.sub(r"\*{1,3}(.+?)\*{1,3}", r"\1", text)
    # Remove inline code
    text = re.sub(r"`(.+?)`", r"\1", text)
    # Remove headings
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Remove bullet/numbered list markers
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    return text.strip()


SYSTEM_INSTRUCTIONS = """You are Dr Aara, a warm and compassionate AI health companion. You support people dealing with chronic illness, mental health challenges, and everyday wellness concerns.

Your personality:
- Empathetic, calm, and non-judgmental
- Knowledgeable about health topics but always remind users to consult a real doctor for medical decisions
- You speak naturally and warmly, like a trusted friend who happens to know a lot about health
- You support emotional wellbeing as much as physical health
- Keep responses concise (2-4 sentences) since they are spoken aloud

Your capabilities:
- Listen and validate feelings
- Provide general health information and wellness tips
- Help identify symptom patterns
- Offer coping strategies for stress, anxiety, and chronic conditions
- Suggest when to seek professional medical help

Always respond in a warm, conversational tone. If the user speaks in Hindi or another Indian language, respond in that same language."""


async def entrypoint(ctx: JobContext):
    session = AgentSession(
        before_tts_cb=strip_markdown,
        stt=sarvam.STT(
            language="en-IN",
            model="saaras:v3",
        ),
        llm=google.LLM(
            model="gemini-3-flash-preview",
            api_key=os.getenv("GEMINI_API_KEY"),
        ),
        tts=sarvam.TTS(
            target_language_code="en-IN",
            model="bulbul:v3",
            speaker="shreya",
            pace=1.15,
        ),
        vad=silero.VAD.load(),
    )

    simli_avatar = simli.AvatarSession(
        simli_config=simli.SimliConfig(
            api_key=os.getenv("SIMLI_API_KEY"),
            face_id=os.getenv("SIMLI_FACE_ID"),
        ),
    )
    await simli_avatar.start(session, room=ctx.room)

    await session.start(
        agent=Agent(instructions=SYSTEM_INSTRUCTIONS),
        room=ctx.room,
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, worker_type=WorkerType.ROOM))
