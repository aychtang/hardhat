import type { request as RequestT } from "undici";

import AbortController from "abort-controller";
import debug from "debug";
import { v4 as uuid } from "uuid";

import { isLocalDev } from "../core/execution-mode";
import { isRunningOnCiServer } from "../util/ci-detection";
import {
  readAnalyticsId,
  readFirstLegacyAnalyticsId,
  readSecondLegacyAnalyticsId,
  writeAnalyticsId,
} from "../util/global-dir";
import { getPackageJson } from "../util/packageInfo";

const log = debug("hardhat:core:analytics");

interface AnalyticsPayload {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  client_id: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  user_id: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  user_properties: {
    projectId: {
      value?: string;
    };
    userType: {
      value?: string;
    };
    hardhatVersion: {
      value?: string;
    };
  };
  events: Array<{
    name: string;
    params: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      engagement_time_msec: string;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      session_id: string;
    };
  }>;
}

type AbortAnalytics = () => void;

export class Analytics {
  public static async getInstance(telemetryConsent: boolean | undefined) {
    const analytics: Analytics = new Analytics(
      await getClientId(),
      telemetryConsent,
      getUserType()
    );

    return analytics;
  }

  private readonly _clientId: string;
  private readonly _enabled: boolean;
  private readonly _userType: string;
  private readonly _analyticsUrl: string =
    "https://www.google-analytics.com/mp/collect";
  private readonly _apiSecret: string = "fQ5joCsDRTOp55wX8a2cVw";
  private readonly _measurementId: string = "G-8LQ007N2QJ";
  private _sessionId: string;

  private constructor(
    clientId: string,
    telemetryConsent: boolean | undefined,
    userType: string
  ) {
    this._clientId = clientId;
    this._enabled =
      !isLocalDev() && !isRunningOnCiServer() && telemetryConsent === true;
    this._userType = userType;
    this._sessionId = Math.random().toString();
  }

  /**
   * Attempt to send a hit to Google Analytics using the Measurement Protocol.
   * This function returns immediately after starting the request, returning a function for aborting it.
   * The idea is that we don't want Hardhat tasks to be slowed down by a slow network request, so
   * Hardhat can abort the request if it takes too much time.
   *
   * Trying to abort a successfully completed request is a no-op, so it's always safe to call it.
   *
   * @returns The abort function
   */
  public async sendTaskHit(): Promise<[AbortAnalytics, Promise<void>]> {
    if (!this._enabled) {
      return [() => {}, Promise.resolve()];
    }

    return this._sendHit(await this._buildTaskHitPayload());
  }

  private async _buildTaskHitPayload(): Promise<AnalyticsPayload> {
    return {
      client_id: this._clientId,
      user_id: this._clientId,
      user_properties: {
        projectId: { value: "hardhat-project" },
        userType: { value: this._userType },
        hardhatVersion: { value: await getHardhatVersion() },
      },
      events: [
        {
          name: "task",
          params: {
            engagement_time_msec: "10000",
            session_id: this._sessionId,
          },
        },
      ],
    };
  }

  private _sendHit(payload: AnalyticsPayload): [AbortAnalytics, Promise<void>] {
    const { request } = require("undici") as { request: typeof RequestT };
    const eventName = payload.events[0].name;
    log(`Sending hit for ${eventName}`);

    const controller = new AbortController();

    const abortAnalytics = () => {
      log(`Aborting hit for ${eventName}`);

      controller.abort();
    };

    log(`Hit payload: ${JSON.stringify(payload)}`);

    const hitPromise = request(this._analyticsUrl, {
      query: {
        api_secret: this._apiSecret,
        measurement_id: this._measurementId,
      },
      body: JSON.stringify(payload),
      method: "POST",
      signal: controller.signal,
    })
      .then(() => {
        log(`Hit for ${eventName} sent successfully`);
      })
      .catch(() => {
        log("Hit request failed");
      });

    return [abortAnalytics, hitPromise];
  }
}

async function getClientId() {
  let clientId = await readAnalyticsId();

  if (clientId === undefined) {
    clientId =
      (await readSecondLegacyAnalyticsId()) ??
      (await readFirstLegacyAnalyticsId());

    if (clientId === undefined) {
      log("Client Id not found, generating a new one");
      clientId = uuid();
    }

    await writeAnalyticsId(clientId);
  }

  return clientId;
}

function getUserType(): string {
  return isRunningOnCiServer() ? "CI" : "Developer";
}

async function getHardhatVersion(): Promise<string> {
  const { version } = await getPackageJson();

  return `Hardhat ${version}`;
}
