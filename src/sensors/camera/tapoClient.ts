import { TapoCamera } from 'tapo-camera-client';
import { config } from '../../config/env.js';

export interface TapoClientOptions {
  host?: string;
  user?: string;
  password?: string;
}

export class TapoCameraService {
  private tapoClient: TapoCamera | null = null;
  public readonly host: string;
  public readonly user: string;
  public readonly password: string;
  private isConnected: boolean = false;

  constructor(options?: TapoClientOptions) {
    this.host = options?.host || config.tapoCameraIp;
    this.user = options?.user || config.tapoCameraUser;
    this.password = options?.password || config.tapoCameraPassword;
  }

  /**
   * Initializes the Tapo camera client connection using tapo-camera-client
   */
  public async init(): Promise<boolean> {
    try {
      console.log(`[TapoCameraService] Connecting to Tapo camera at ${this.host}...`);
      this.tapoClient = new TapoCamera({
        host: this.host,
        user: this.user,
        password: this.password,
        reuseSession: true,
      });

      await this.tapoClient.init();
      this.isConnected = true;
      console.log(`[TapoCameraService] ✅ Connected to Tapo Camera at ${this.host}`);
      return true;
    } catch (err) {
      console.warn(`[TapoCameraService] ⚠️ Tapo camera API initialization failed at ${this.host} (${(err as Error).message}). RTSP streaming will still be attempted.`);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Constructs the RTSP stream URL for streaming via ffmpeg.
   * Encodes username/password special characters (e.g. '@' in email).
   */
  public getRtspStreamUrl(stream: 'stream1' | 'stream2' = 'stream1', port: number | string = 554): string {
    const encodedUser = encodeURIComponent(this.user);
    const encodedPassword = encodeURIComponent(this.password);
    const portStr = port ? `:${port}` : '';
    return `rtsp://${encodedUser}:${encodedPassword}@${this.host}${portStr}/${stream}`;
  }

  /**
   * Constructs RTSP URL using local camera account username (stripping domain if email is provided)
   */
  public getRtspStreamUrlAccount(stream: 'stream1' | 'stream2' = 'stream1', port: number | string = 554): string {
    const accountUser = this.user.includes('@') ? this.user.split('@')[0] : this.user;
    const encodedUser = encodeURIComponent(accountUser);
    const encodedPassword = encodeURIComponent(this.password);
    const portStr = port ? `:${port}` : '';
    return `rtsp://${encodedUser}:${encodedPassword}@${this.host}${portStr}/${stream}`;
  }

  /**
   * Constructs unencoded RTSP URL for ffmpeg clients that perform their own URL decoding
   */
  public getRtspStreamUrlRaw(stream: 'stream1' | 'stream2' = 'stream1', port: number | string = 554): string {
    const portStr = port ? `:${port}` : '';
    return `rtsp://${this.user}:${this.password}@${this.host}${portStr}/${stream}`;
  }

  /**
   * Constructs RTSP URL using an explicit custom username
   */
  public getRtspStreamUrlWithCustomUser(customUser: string, stream: 'stream1' | 'stream2' = 'stream1', port: number | string = 554): string {
    const encodedUser = encodeURIComponent(customUser);
    const encodedPassword = encodeURIComponent(this.password);
    const portStr = port ? `:${port}` : '';
    return `rtsp://${encodedUser}:${encodedPassword}@${this.host}${portStr}/${stream}`;
  }

  public isOnline(): boolean {
    return this.isConnected;
  }

  public getClient(): TapoCamera | null {
    return this.tapoClient;
  }

  public async getBasicInfo(): Promise<any | null> {
    if (!this.tapoClient || !this.isConnected) return null;
    try {
      return await this.tapoClient.getBasicInfo();
    } catch {
      return null;
    }
  }

  public async moveMotor(x: number, y: number): Promise<boolean> {
    if (!this.tapoClient || !this.isConnected) return false;
    try {
      await this.tapoClient.moveMotor(x, y);
      return true;
    } catch {
      return false;
    }
  }

  public async setPrivacyMode(enabled: boolean): Promise<boolean> {
    if (!this.tapoClient || !this.isConnected) return false;
    try {
      await this.tapoClient.setPrivacyMode(enabled as any);
      return true;
    } catch {
      return false;
    }
  }
}
