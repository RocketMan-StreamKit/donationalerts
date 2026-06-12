import { DonationAlertsApi } from './api';
import { CENTRIFUGO_WS_URL } from './constants';
import { pushDonation, type DonationAlertPayload } from './dashboard-feed';

type WsConnection = Awaited<ReturnType<(typeof network.websocket)['connect']>>;

type CentrifugoFrame = {
  id?: number;
  method?: number;
  push?: {
    channel?: string;
    pub?: {
      data?: DonationAlertPayload | { data?: DonationAlertPayload };
    };
  };
  result?: {
    client?: string;
    channel?: string;
    data?: {
      data?: DonationAlertPayload;
    };
  };
  error?: { message?: string };
};

const extractDonation = (frame: CentrifugoFrame) => {
  const legacyChannel = frame.result?.channel || '';
  const legacyDonation = frame.result?.data?.data;
  if (legacyDonation && legacyChannel.startsWith('$alerts:donation_')) {
    return { donation: legacyDonation, channel: legacyChannel };
  }

  const pushChannel = frame.push?.channel || '';
  const pubData = frame.push?.pub?.data;
  if (!pushChannel.startsWith('$alerts:donation_') || !pubData) {
    return null;
  }

  if (
    typeof pubData === 'object' &&
    pubData !== null &&
    'data' in pubData &&
    (pubData as { data?: DonationAlertPayload }).data
  ) {
    return {
      donation: (pubData as { data: DonationAlertPayload }).data,
      channel: pushChannel,
    };
  }

  if (
    typeof pubData === 'object' &&
    pubData !== null &&
    typeof (pubData as DonationAlertPayload).id === 'number'
  ) {
    return { donation: pubData as DonationAlertPayload, channel: pushChannel };
  }

  return null;
};

const RECONNECT_DELAY_MS = 5000;
const OPEN_TIMEOUT_MS = 15_000;

const formatError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : JSON.stringify(error);

const waitForOpen = (ws: WsConnection) =>
  new Promise<void>((resolve, reject) => {
    if (ws.state === 1) {
      resolve();
      return;
    }

    let openSub: ReturnType<WsConnection['On']> | null = null;
    let errorSub: ReturnType<WsConnection['On']> | null = null;

    const timeout = setTimeout(() => {
      openSub?.Destroy();
      errorSub?.Destroy();
      reject(new Error('WebSocket open timeout'));
    }, OPEN_TIMEOUT_MS);

    openSub = ws.On('open', () => {
      clearTimeout(timeout);
      errorSub?.Destroy();
      resolve();
    });
    errorSub = ws.On('error', (error: Error) => {
      clearTimeout(timeout);
      openSub?.Destroy();
      reject(error);
    });
  });

export class DonationAlertsCentrifugoClient {
  private connection: WsConnection | null = null;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly userId: number;

  constructor(userId: number) {
    this.userId = userId;
  }

  async start() {
    this.destroyed = false;
    await this.connect();
  }

  stop() {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.destroyConnection(this.connection);
    this.connection = null;
  }

  private async connect() {
    if (this.destroyed) {
      return;
    }

    try {
      const user = await DonationAlertsApi.getUserOAuth(true);
      if (!user?.socket_connection_token) {
        this.scheduleReconnect();
        return;
      }

      const ws = await network.websocket.connect(CENTRIFUGO_WS_URL, {});
      if (this.destroyed) {
        ws.Destroy();
        return;
      }

      this.destroyConnection(this.connection);
      this.connection = ws;

      ws.On('message', (raw: string) => {
        void this.onMessage(raw, ws);
      });
      ws.On('close', () => {
        if (!this.destroyed && this.connection === ws) {
          this.scheduleReconnect();
        }
      });
      ws.On('error', (error: Error) => {
        console.error('DonationAlerts Centrifugo error:', formatError(error));
      });

      await waitForOpen(ws);

      ws.Send({
        params: { token: user.socket_connection_token },
        id: 1,
      });
    } catch (error) {
      console.error(
        'DonationAlerts Centrifugo connect failed:',
        formatError(error)
      );
      this.scheduleReconnect();
    }
  }

  private async onMessage(raw: string, ws: WsConnection) {
    let frame: CentrifugoFrame;
    try {
      frame = JSON.parse(raw) as CentrifugoFrame;
    } catch (error) {
      console.error(error);
      return;
    }

    if (frame.id === 1) {
      const clientId = frame.result?.client;
      if (!clientId) {
        console.error(
          'DonationAlerts Centrifugo auth failed:',
          frame.error?.message || 'missing client id'
        );
        this.scheduleReconnect();
        return;
      }

      const channel = `$alerts:donation_${this.userId}`;
      const subscriptionToken =
        await DonationAlertsApi.subscribeCentrifugoChannel(clientId, channel);
      if (!subscriptionToken) {
        this.scheduleReconnect();
        return;
      }

      try {
        ws.Send({
          id: 2,
          method: 1,
          params: {
            channel,
            token: subscriptionToken,
          },
        });
        console.log(`[DonationAlerts] Subscribed to ${channel}`);
      } catch (error) {
        console.error('DonationAlerts channel subscribe failed:', error);
        this.scheduleReconnect();
      }
      return;
    }

    if (frame.id) {
      if (frame.id === 2 && frame.error) {
        console.error(
          'DonationAlerts channel subscribe failed:',
          frame.error.message || 'unknown error'
        );
        this.scheduleReconnect();
      }
      return;
    }

    const extracted = extractDonation(frame);
    if (!extracted) {
      return;
    }

    const donation = extracted.donation;

    if (
      typeof donation.id !== 'number' ||
      typeof donation.amount !== 'number'
    ) {
      return;
    }

    if (!donation.message) {
      donation.message = '';
    }

    await pushDonation(donation);
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) {
      return;
    }

    this.destroyConnection(this.connection);
    this.connection = null;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private destroyConnection(connection: WsConnection | null) {
    if (!connection) {
      return;
    }
    try {
      connection.Destroy();
    } catch (error) {
      console.error(error);
    }
  }
}
