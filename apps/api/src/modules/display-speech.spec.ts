import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { azureSpeechConfiguration } from "../config";
import {
  amharicCallAnnouncement,
  AzureSpeechService,
  buildAmharicSsml,
  spokenAmharicDigits,
} from "./display-speech";

const SPEECH_ENVIRONMENT = [
  "AZURE_SPEECH_KEY",
  "AZURE_SPEECH_REGION",
  "AZURE_SPEECH_VOICE",
] as const;

const originalEnvironment = Object.fromEntries(
  SPEECH_ENVIRONMENT.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  for (const name of SPEECH_ENVIRONMENT) delete process.env[name];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of SPEECH_ENVIRONMENT) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("Amharic display speech", () => {
  it("speaks ticket and counter digits in Amharic", () => {
    expect(spokenAmharicDigits("DEP-042")).toBe("ዜሮ አራት ሁለት");
    expect(amharicCallAnnouncement("DEP-042", "Counter 3")).toBe(
      "ትኬት ቁጥር ዜሮ አራት ሁለት ወደ መስኮት ቁጥር ሶስት ይሂዱ።",
    );
  });

  it("escapes synthesized content before placing it in SSML", () => {
    const ssml = buildAmharicSsml('A&B <"test">', "am-ET-MekdesNeural");
    expect(ssml).toContain("A&amp;B &lt;&quot;test&quot;&gt;");
    expect(ssml).toContain('xml:lang="am-ET"');
  });

  it("allows the visual display to run when cloud speech is unconfigured", () => {
    expect(azureSpeechConfiguration()).toBeNull();
    expect(() => new AzureSpeechService().isConfigured()).not.toThrow();
  });

  it("rejects a partially configured cloud speech service", () => {
    process.env.AZURE_SPEECH_KEY = "test-key";
    expect(() => azureSpeechConfiguration()).toThrow(
      "AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be configured together.",
    );
  });

  it("requests one cached MP3 from Azure for repeated playback", async () => {
    process.env.AZURE_SPEECH_KEY = "test-key";
    process.env.AZURE_SPEECH_REGION = "eastus";
    process.env.AZURE_SPEECH_VOICE = "am-ET-MekdesNeural";
    const fetchMock = vi.fn(
      async (
        _input: string | URL | Request,
        _request?: RequestInit,
      ): Promise<Response> =>
        Promise.resolve(
          new Response(Uint8Array.from([1, 2, 3]), {
            status: 200,
            headers: { "content-type": "audio/mpeg" },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const speech = new AzureSpeechService();

    const first = await speech.synthesize("ትኬት ቁጥር አንድ");
    const second = await speech.synthesize("ትኬት ቁጥር አንድ");

    expect([...first]).toEqual([1, 2, 3]);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1",
    );
    expect(request?.headers).toMatchObject({
      "Ocp-Apim-Subscription-Key": "test-key",
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
    });
    expect(String(request?.body)).toContain("am-ET-MekdesNeural");
  });
});
