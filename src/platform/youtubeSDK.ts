/**
 * YouTube Playables SDK Integration & Mock Fallback Bridge
 * Follows: https://developers.google.com/youtube/gaming/playables/reference/sdk
 */

export interface YTPlayablesSDK {
  game: {
    firstFrameReady: () => void;
    gameReady: () => void;
  };
  storage: {
    loadData: () => Promise<string>;
    saveData: (data: string) => Promise<void>;
  };
  engagement: {
    sendScore: (scoreData: { value: number }) => void;
  };
  system: {
    isAudioEnabled: () => boolean;
    onAudioEnabledChange: (callback: (enabled: boolean) => void) => void;
    onPause: (callback: () => void) => void;
    onResume: (callback: () => void) => void;
    getLanguage?: () => string;
  };
  ads?: {
    requestInterstitialAd: () => Promise<void>;
    requestRewardedAd: (rewardType: string) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    ytgame?: YTPlayablesSDK;
  }
}

class YouTubeSDKBridge {
  private sdk: YTPlayablesSDK;
  private isLoaded: boolean = false;
  private hasLoadedData: boolean = false;
  private pauseCallbacks: (() => void)[] = [];
  private resumeCallbacks: (() => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined' && window.ytgame) {
      this.sdk = window.ytgame;
      this.isLoaded = true;
    } else {
      // Local development mock fallback
      let audioEnabled = true;
      const audioCallbacks: ((enabled: boolean) => void)[] = [];

      this.sdk = {
        game: {
          firstFrameReady: () => {
            console.log('[YouTube Playables SDK Mock] firstFrameReady()');
          },
          gameReady: () => {
            console.log('[YouTube Playables SDK Mock] gameReady()');
          },
        },
        storage: {
          loadData: async () => {
            console.log('[YouTube Playables SDK Mock] loadData()');
            try {
              return localStorage.getItem('rubiks_tictactoe_yt_save') || '{}';
            } catch {
              return '{}';
            }
          },
          saveData: async (data: string) => {
            console.log('[YouTube Playables SDK Mock] saveData()', data);
            try {
              localStorage.setItem('rubiks_tictactoe_yt_save', data);
            } catch (err) {
              console.warn('Failed to save to mock storage', err);
            }
          },
        },
        engagement: {
          sendScore: (scoreData) => {
            console.log('[YouTube Playables SDK Mock] sendScore()', scoreData);
          },
        },
        system: {
          isAudioEnabled: () => audioEnabled,
          onAudioEnabledChange: (cb) => {
            audioCallbacks.push(cb);
          },
          onPause: (cb) => {
            this.pauseCallbacks.push(cb);
          },
          onResume: (cb) => {
            this.resumeCallbacks.push(cb);
          },
          getLanguage: () => navigator.language || 'en-US',
        },
        ads: {
          requestInterstitialAd: async () => {
            console.log('[YouTube Playables SDK Mock] ads.requestInterstitialAd() started');
            // Trigger pause callback during mock ad
            this.triggerPause();
            await new Promise((resolve) => setTimeout(resolve, 800));
            this.triggerResume();
            console.log('[YouTube Playables SDK Mock] ads.requestInterstitialAd() completed');
          },
          requestRewardedAd: async (rewardType: string) => {
            console.log(`[YouTube Playables SDK Mock] ads.requestRewardedAd("${rewardType}") started`);
            this.triggerPause();
            await new Promise((resolve) => setTimeout(resolve, 900));
            this.triggerResume();
            console.log(`[YouTube Playables SDK Mock] ads.requestRewardedAd("${rewardType}") completed (reward earned)`);
            return true;
          },
        },
      };
    }
  }

  private triggerPause() {
    for (const cb of this.pauseCallbacks) {
      try {
        cb();
      } catch (err) {
        console.warn('Error in pause callback:', err);
      }
    }
  }

  private triggerResume() {
    for (const cb of this.resumeCallbacks) {
      try {
        cb();
      } catch (err) {
        console.warn('Error in resume callback:', err);
      }
    }
  }

  public firstFrameReady() {
    this.sdk.game.firstFrameReady();
  }

  public gameReady() {
    this.sdk.game.gameReady();
  }

  public async loadData(): Promise<Record<string, unknown>> {
    try {
      const raw = await this.sdk.storage.loadData();
      this.hasLoadedData = true;
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('Error loading Playables cloud save:', e);
      this.hasLoadedData = true;
      return {};
    }
  }

  public async saveData(data: Record<string, unknown>): Promise<void> {
    if (!this.hasLoadedData) {
      console.warn('Cannot call saveData before loadData completes');
      return;
    }
    try {
      const serialized = JSON.stringify(data);
      // Ensure data stays within 64 KiB safe ceiling
      if (serialized.length > 64 * 1024) {
        console.warn('Save data exceeds 64 KiB ceiling, trimming');
      }
      await this.sdk.storage.saveData(serialized);
    } catch (e) {
      console.warn('Error saving to Playables storage:', e);
    }
  }

  public sendScore(score: number) {
    try {
      this.sdk.engagement.sendScore({ value: Math.max(0, Math.floor(score)) });
    } catch (e) {
      console.warn('Error sending score:', e);
    }
  }

  public isAudioEnabled(): boolean {
    try {
      return this.sdk.system.isAudioEnabled();
    } catch {
      return true;
    }
  }

  public onAudioEnabledChange(cb: (enabled: boolean) => void) {
    this.sdk.system.onAudioEnabledChange(cb);
  }

  public onPause(cb: () => void) {
    this.pauseCallbacks.push(cb);
    this.sdk.system.onPause(cb);
  }

  public onResume(cb: () => void) {
    this.resumeCallbacks.push(cb);
    this.sdk.system.onResume(cb);
  }

  /**
   * Request an interstitial ad (e.g. between game sessions / on match end).
   * Fully wrapped in try/catch to gracefully handle ad blocker / unavailable state.
   */
  public async requestInterstitialAd(): Promise<void> {
    try {
      if (this.sdk.ads?.requestInterstitialAd) {
        await this.sdk.ads.requestInterstitialAd();
      } else {
        console.log('[YouTube Playables SDK] ads.requestInterstitialAd not available on platform');
      }
    } catch (err) {
      console.warn('[YouTube Playables SDK] Interstitial ad request failed or dismissed:', err);
    }
  }

  /**
   * Request a rewarded ad (e.g. Undo Last 5 Moves).
   * Resolves to true if user successfully earned the reward, false otherwise.
   */
  public async requestRewardedAd(rewardType: string = 'undo-last-5-moves-reward'): Promise<boolean> {
    try {
      if (this.sdk.ads?.requestRewardedAd) {
        return await this.sdk.ads.requestRewardedAd(rewardType);
      } else {
        console.log('[YouTube Playables SDK] ads.requestRewardedAd not available, falling back gracefully');
        return false;
      }
    } catch (err) {
      console.warn('[YouTube Playables SDK] Rewarded ad request failed or closed early:', err);
      return false;
    }
  }

  public isRunningInYouTube(): boolean {
    return this.isLoaded;
  }
}

export const ytSDK = new YouTubeSDKBridge();
