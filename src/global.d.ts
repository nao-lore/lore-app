declare function gtag(...args: unknown[]): void;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare const chrome: {
  runtime?: {
    sendMessage: (extensionId: string, message: unknown, callback: (response: unknown) => void) => void;
    id?: string;
    lastError?: { message?: string };
  };
  storage?: {
    local: {
      set: (items: Record<string, unknown>) => void;
      get: (keys: string | string[], callback: (result: Record<string, unknown>) => void) => void;
    };
  };
} | undefined;
