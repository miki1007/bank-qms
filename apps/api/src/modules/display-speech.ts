import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Injectable,
  Param,
  StreamableFile,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { z } from "zod";
import {
  azureSpeechConfiguration,
  type AzureSpeechConfiguration,
} from "../config";
import { PrismaService } from "../prisma.service";
import { DomainError } from "../shared/domain-error";
import { PublicRoute } from "./auth";

const READY_ANNOUNCEMENT = "የድምፅ ማስታወቂያ ተከፍቷል።";
const MAX_CACHE_ITEMS = 128;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

const AMHARIC_DIGITS: Record<string, string> = {
  "0": "ዜሮ",
  "1": "አንድ",
  "2": "ሁለት",
  "3": "ሶስት",
  "4": "አራት",
  "5": "አምስት",
  "6": "ስድስት",
  "7": "ሰባት",
  "8": "ስምንት",
  "9": "ዘጠኝ",
};

export function spokenAmharicDigits(value: string) {
  const digits = value.match(/\d/g);
  return digits?.length
    ? digits.map((digit) => AMHARIC_DIGITS[digit]).join(" ")
    : value;
}

export function amharicCallAnnouncement(
  publicNumber: string,
  counterLabel: string,
) {
  return [
    "ትኬት ቁጥር",
    spokenAmharicDigits(publicNumber),
    "ወደ መስኮት ቁጥር",
    spokenAmharicDigits(counterLabel),
    "ይሂዱ።",
  ].join(" ");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildAmharicSsml(text: string, voice: string) {
  return [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="am-ET">',
    `<voice name="${escapeXml(voice)}"><prosody rate="-8%">`,
    escapeXml(text),
    "</prosody></voice></speak>",
  ].join("");
}

@Injectable()
export class AzureSpeechService {
  private readonly cache = new Map<string, Buffer>();
  private readonly pending = new Map<string, Promise<Buffer>>();

  isConfigured() {
    return azureSpeechConfiguration() !== null;
  }

  configuredVoice() {
    return azureSpeechConfiguration()?.voice ?? null;
  }

  async synthesize(text: string) {
    const configuration = azureSpeechConfiguration();
    if (!configuration) {
      throw new DomainError(
        "SPEECH_NOT_CONFIGURED",
        "Amharic cloud speech has not been configured.",
        503,
      );
    }

    const cacheKey = `${configuration.voice}:\0${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const existing = this.pending.get(cacheKey);
    if (existing) return existing;

    const request = this.requestSpeech(configuration, text)
      .then((audio) => {
        this.remember(cacheKey, audio);
        return audio;
      })
      .finally(() => this.pending.delete(cacheKey));
    this.pending.set(cacheKey, request);
    return request;
  }

  private remember(key: string, audio: Buffer) {
    this.cache.set(key, audio);
    while (this.cache.size > MAX_CACHE_ITEMS) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
  }

  private async requestSpeech(
    configuration: AzureSpeechConfiguration,
    text: string,
  ) {
    try {
      const response = await fetch(
        `https://${configuration.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": configuration.key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "worldlink-bank-qms",
          },
          body: buildAmharicSsml(text, configuration.voice),
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (!response.ok) {
        throw new Error(`Azure Speech returned HTTP ${response.status}.`);
      }
      const audio = Buffer.from(await response.arrayBuffer());
      if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
        throw new Error("Azure Speech returned an invalid audio payload.");
      }
      return audio;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "SPEECH_PROVIDER_UNAVAILABLE",
        "The Amharic announcement service is temporarily unavailable.",
        503,
      );
    }
  }
}

@Injectable()
export class DisplaySpeechService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AzureSpeechService)
    private readonly speech: AzureSpeechService,
  ) {}

  private async authenticateDisplay(deviceCode: string, deviceSecret: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceCode },
    });
    if (
      !device ||
      !deviceSecret ||
      device.type !== "DISPLAY" ||
      device.status !== "ACTIVE" ||
      !(await argon2.verify(device.credentialHash, deviceSecret))
    ) {
      throw new DomainError(
        "FORBIDDEN",
        "This display device is not authorized.",
        403,
      );
    }
    return device;
  }

  async status(deviceCode: string, deviceSecret: string) {
    await this.authenticateDisplay(deviceCode, deviceSecret);
    return {
      available: this.speech.isConfigured(),
      provider: this.speech.isConfigured() ? "azure" : null,
      locale: "am-ET",
      voice: this.speech.configuredVoice(),
    };
  }

  async ready(deviceCode: string, deviceSecret: string) {
    await this.authenticateDisplay(deviceCode, deviceSecret);
    return this.speech.synthesize(READY_ANNOUNCEMENT);
  }

  async ticket(deviceCode: string, deviceSecret: string, rawTicketId: string) {
    const ticketId = z.string().uuid().safeParse(rawTicketId);
    if (!ticketId.success) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "A valid ticket identifier is required.",
        400,
      );
    }
    const device = await this.authenticateDisplay(deviceCode, deviceSecret);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId.data, branchId: device.branchId },
      include: { assignedCounter: true },
    });
    if (!ticket) {
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "Ticket not found for this display.",
        404,
      );
    }
    if (!ticket.assignedCounter) {
      throw new DomainError(
        "TICKET_NOT_CALLED",
        "The ticket has not been assigned to a counter.",
        409,
      );
    }
    return this.speech.synthesize(
      amharicCallAnnouncement(
        ticket.publicNumber,
        ticket.assignedCounter.label,
      ),
    );
  }
}

@PublicRoute()
@Controller("public/devices/:deviceCode/announcements")
export class DisplaySpeechController {
  constructor(
    @Inject(DisplaySpeechService)
    private readonly displaySpeech: DisplaySpeechService,
  ) {}

  @Get("status")
  status(
    @Param("deviceCode") deviceCode: string,
    @Headers("x-device-secret") deviceSecret = "",
  ) {
    return this.displaySpeech.status(deviceCode, deviceSecret);
  }

  @Get("ready")
  @Header("Content-Type", "audio/mpeg")
  @Header("Cache-Control", "private, max-age=300")
  async ready(
    @Param("deviceCode") deviceCode: string,
    @Headers("x-device-secret") deviceSecret = "",
  ) {
    return new StreamableFile(
      await this.displaySpeech.ready(deviceCode, deviceSecret),
    );
  }

  @Get("tickets/:ticketId")
  @Header("Content-Type", "audio/mpeg")
  @Header("Cache-Control", "private, max-age=300")
  async ticket(
    @Param("deviceCode") deviceCode: string,
    @Param("ticketId") ticketId: string,
    @Headers("x-device-secret") deviceSecret = "",
  ) {
    return new StreamableFile(
      await this.displaySpeech.ticket(deviceCode, deviceSecret, ticketId),
    );
  }
}
