import { API_BASE, DEFAULT_API_SERVER, REDIRECT_URI } from './constants';
import { mergeDonationAlertsParams } from './params';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type DonationAlertsUser = {
  id: number;
  code: string;
  name: string;
  avatar?: string;
  socket_connection_token: string;
};

const normalizeApiServer = (value?: string | null) => {
  const trimmed = value?.trim() || DEFAULT_API_SERVER;
  return trimmed.replace(/\/+$/, '');
};

export const DonationAlertsApi = new (class {
  accessToken: string | null = null;
  refreshToken: string | null = null;
  apiServer: string = DEFAULT_API_SERVER;
  private refreshInFlight: Promise<boolean> | null = null;
  private userOAuthCache: {
    expiresAt: number;
    user: DonationAlertsUser;
  } | null = null;

  setApiServer(value?: string | null) {
    this.apiServer = normalizeApiServer(value);
  }

  clearUserOAuthCache() {
    this.userOAuthCache = null;
  }

  private async postTokenEndpoint(
    path: string,
    body: Record<string, unknown>
  ): Promise<string> {
    return network.request.post(`${this.apiServer}${path}`, body);
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private parseBody<T>(response: string, fallback: string) {
    if (!response?.trim()) {
      return { ok: false as const, message: fallback };
    }
    let body: T & { message?: string; error?: string };
    try {
      body = JSON.parse(response) as T & { message?: string; error?: string };
    } catch {
      return { ok: false as const, message: fallback };
    }
    const errorMessage =
      body.error ||
      (typeof (body as { detail?: unknown }).detail === 'string'
        ? (body as { detail: string }).detail
        : undefined);
    if (errorMessage) {
      return { ok: false as const, message: errorMessage };
    }
    return { ok: true as const, body };
  }

  async exchangeAuthorizationCode(code: string): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    message?: string;
  }> {
    try {
      const response = await this.postTokenEndpoint(
        '/donationalerts/oauth/token',
        {
          code,
          redirect_uri: REDIRECT_URI,
        }
      );
      const parsed = this.parseBody<TokenResponse>(
        response,
        'Failed to exchange authorization code'
      );
      if (!parsed.ok || !parsed.body.access_token) {
        const detail =
          parsed.ok === false
            ? parsed.message
            : (parsed.body as { detail?: string }).detail ||
              (parsed.body as TokenResponse).error_description ||
              'DonationAlerts did not return access token';
        return { success: false, message: detail };
      }
      return {
        success: true,
        accessToken: parsed.body.access_token,
        refreshToken: parsed.body.refresh_token,
        expiresIn: parsed.body.expires_in,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'DonationAlerts token exchange failed';
      console.error('DonationAlerts token exchange failed:', error);
      return { success: false, message };
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshToken = this.refreshToken?.trim();
    if (!refreshToken) {
      return false;
    }

    this.refreshInFlight = (async () => {
      try {
        const response = await this.postTokenEndpoint(
          '/donationalerts/oauth/refresh',
          { refresh_token: refreshToken }
        );
        const parsed = this.parseBody<TokenResponse>(
          response,
          'Failed to refresh DonationAlerts token'
        );
        if (!parsed.ok || !parsed.body.access_token) {
          console.warn(
            'DonationAlerts token refresh failed:',
            parsed.ok ? parsed.body.message : parsed.message
          );
          return false;
        }

        this.accessToken = parsed.body.access_token;
        if (parsed.body.refresh_token) {
          this.refreshToken = parsed.body.refresh_token;
        }
        this.clearUserOAuthCache();

        const expiresAt =
          typeof parsed.body.expires_in === 'number'
            ? Date.now() + parsed.body.expires_in * 1000
            : Date.now() + 3600 * 1000;

        await mergeDonationAlertsParams({
          access_token: this.accessToken,
          refresh_token: this.refreshToken,
          token_expires_at: expiresAt,
        });

        return true;
      } catch (error) {
        console.error(
          'DonationAlerts token refresh error:',
          error instanceof Error ? error.message : error
        );
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async ensureAccessToken(expiresAt?: number): Promise<boolean> {
    if (!this.accessToken) {
      return false;
    }
    const shouldRefresh = !expiresAt || Date.now() >= expiresAt - 60_000;
    if (shouldRefresh && this.refreshToken) {
      return this.refreshAccessToken();
    }
    return true;
  }

  async getUserOAuth(force = false): Promise<DonationAlertsUser | null> {
    if (
      !force &&
      this.userOAuthCache &&
      Date.now() < this.userOAuthCache.expiresAt
    ) {
      return this.userOAuthCache.user;
    }

    if (!this.accessToken) {
      return null;
    }

    try {
      const response = await network.request.get(`${API_BASE}/user/oauth`, {
        Authorization: `Bearer ${this.accessToken}`,
      });
      const parsed = this.parseBody<{
        data?: {
          id?: number;
          code?: string;
          name?: string;
          avatar?: string;
          socket_connection_token?: string;
        };
      }>(response, 'Failed to load DonationAlerts user profile');

      if (!parsed.ok) {
        console.error(parsed.message);
        return null;
      }

      const data = parsed.body.data;
      if (
        typeof data?.id !== 'number' ||
        !data.socket_connection_token?.trim()
      ) {
        return null;
      }

      const user: DonationAlertsUser = {
        id: data.id,
        code: data.code || String(data.id),
        name: data.name || data.code || String(data.id),
        avatar: data.avatar,
        socket_connection_token: data.socket_connection_token.trim(),
      };

      this.userOAuthCache = {
        user,
        expiresAt: Date.now() + 30_000,
      };

      return user;
    } catch (error) {
      console.error('Failed to load DonationAlerts user profile:', error);
      return null;
    }
  }

  async subscribeCentrifugoChannel(
    clientId: string,
    channel: string
  ): Promise<string | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const response = await network.request.post(
        `${API_BASE}/centrifuge/subscribe`,
        {
          client: clientId,
          channels: [channel],
        },
        this.authHeaders()
      );
      const parsed = this.parseBody<{
        channels?: { channel?: string; token?: string }[];
      }>(response, 'Failed to subscribe to DonationAlerts channel');

      if (!parsed.ok) {
        console.error(parsed.message);
        return null;
      }

      const entry = (parsed.body.channels ?? []).find(
        item => item.channel === channel && item.token
      );
      return entry?.token?.trim() || null;
    } catch (error) {
      console.error('DonationAlerts centrifuge subscribe failed:', error);
      return null;
    }
  }
})();
