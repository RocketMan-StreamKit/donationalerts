import { PLATFORM } from './constants';

export type DonationAlertPayload = {
  id: number;
  name: string;
  username: string;
  message: string;
  amount: number;
  currency: string;
  additional_data?: string;
};

const userId = (name: string) => `donationalerts:${name.trim().toLowerCase()}`;

const parseAdditionalData = (raw?: string) => {
  if (!raw?.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw) as {
      is_commission_covered?: 0 | 1;
      media_data?: { id?: string; title?: string; url?: string };
    };
  } catch {
    return null;
  }
};

const buildMessage = (payload: DonationAlertPayload) => {
  const message = payload.message?.trim() || '';

  if (
    message.startsWith('https://static.donationalerts.ru/audiodonations/') &&
    message.endsWith('.wav')
  ) {
    return '';
  }

  const additional = parseAdditionalData(payload.additional_data);
  if (additional?.media_data?.title && additional.media_data.url) {
    const mediaTitle = additional.media_data.title.trim();
    if (message) {
      return `${message} (${mediaTitle})`;
    }
    return mediaTitle;
  }

  return message;
};

export const pushDonation = async (payload: DonationAlertPayload) => {
  const donorName =
    payload.username?.trim() || payload.name?.trim() || 'Anonymous';
  const currency = payload.currency?.trim() || 'USD';
  const amount = payload.amount;
  const message = buildMessage(payload);

  const profile = {
    id: userId(donorName),
    name: donorName,
    avatar: '',
    platform: PLATFORM,
  };

  return dashboard.addRecord(
    {
      id: `donationalerts:donation:${payload.id}`,
      type: 'donation',
      platform: PLATFORM,
      from: profile.id,
      amount: [amount, currency],
      message: message || undefined,
    },
    profile,
    { trigger: { type: 'donation', key: currency, value: amount } }
  );
};
