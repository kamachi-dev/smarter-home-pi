import { SupabaseClient } from '@supabase/supabase-js';
import { FaceRecognitionEngine } from '../sensors/camera/faceRecognition.js';

export interface ModelSyncOptions {
  supabase: SupabaseClient | null;
  faceEngine: FaceRecognitionEngine;
}

export class ModelSyncHandler {
  private supabase: SupabaseClient | null;
  private faceEngine: FaceRecognitionEngine;
  private channel: any = null;

  constructor(options: ModelSyncOptions) {
    this.supabase = options.supabase;
    this.faceEngine = options.faceEngine;
  }

  public updateSupabaseClient(client: SupabaseClient | null) {
    this.supabase = client;
    this.setupRealtimeListeners();
  }

  /**
   * Sets up real-time listener on the Supabase storage and family_members table
   * to automatically download and swap the active neural model in memory & disk.
   */
  public setupRealtimeListeners(): void {
    if (!this.supabase) return;

    if (this.channel) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.channel = this.supabase
      .channel('pi-models-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'storage', table: 'objects', filter: "bucket_id=eq.models" },
        async (payload: any) => {
          console.log('[ModelSyncHandler] 📥 Detected model update in Supabase storage.objects:', payload.eventType, payload.new?.name);
          const objectName = payload.new?.name;
          if (objectName && objectName.endsWith('_model.json')) {
            await this.downloadAndApplyModelByPath(objectName);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'family_members' },
        async (payload: any) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const member = payload.new as any;
            if (member && member.model_url) {
              console.log(`[ModelSyncHandler] 🔄 Member ${member.name} has model_url: ${member.model_url}, syncing...`);
              await this.downloadAndApplyModelFromUrl(member.model_url, member);
            } else if (member && member.descriptor && Array.isArray(member.descriptor) && member.descriptor.length === 128) {
              console.log(`[ModelSyncHandler] 🔄 Directly applying 128D descriptor for member ${member.name}`);
              this.faceEngine.applyModelDescriptor({
                id: member.id,
                name: member.name,
                role: member.role || 'Resident',
                descriptor: member.descriptor,
                accuracy: member.accuracy,
                photoCount: member.photo_count || member.photo_urls?.length,
                imageUrl: member.photo_urls?.[0]
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (oldId) {
              console.log(`[ModelSyncHandler] 🗑️ Removing deleted member profile ${oldId} from active face matcher`);
              this.faceEngine.removeEnrolledPerson(oldId);
            }
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ModelSyncHandler] ✅ Subscribed to Supabase Realtime for models bucket & family_members');
        }
      });
  }

  /**
   * Downloads model JSON by bucket object path (e.g. faces/<userId>/<memberId>_model.json)
   */
  public async downloadAndApplyModelByPath(storagePath: string): Promise<boolean> {
    if (!this.supabase) return false;
    try {
      console.log(`[ModelSyncHandler] ⬇️ Downloading updated model from models/${storagePath}...`);
      const { data, error } = await this.supabase.storage
        .from('models')
        .download(storagePath);

      if (error || !data) {
        console.warn(`[ModelSyncHandler] ⚠️ Failed to download model ${storagePath}:`, error?.message);
        return false;
      }

      const text = await data.text();
      const modelJson = JSON.parse(text);
      return this.applyDownloadedModel(modelJson);
    } catch (err) {
      console.error('[ModelSyncHandler] Error processing model download by path:', (err as Error).message);
      return false;
    }
  }

  /**
   * Downloads model JSON via direct HTTP public URL
   */
  public async downloadAndApplyModelFromUrl(modelUrl: string, memberContext?: any): Promise<boolean> {
    try {
      console.log(`[ModelSyncHandler] ⬇️ Fetching model from URL: ${modelUrl}`);
      const res = await fetch(modelUrl, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const modelJson = await res.json();
      return this.applyDownloadedModel(modelJson, memberContext);
    } catch (err) {
      console.warn(`[ModelSyncHandler] ⚠️ Failed to fetch model from URL: ${(err as Error).message}`);
      // Fallback: If memberContext has descriptor directly
      if (memberContext?.descriptor && Array.isArray(memberContext.descriptor) && memberContext.descriptor.length === 128) {
        this.faceEngine.applyModelDescriptor({
          id: memberContext.id,
          name: memberContext.name,
          role: memberContext.role || 'Resident',
          descriptor: memberContext.descriptor,
          accuracy: memberContext.accuracy,
          photoCount: memberContext.photo_count || memberContext.photo_urls?.length,
          imageUrl: memberContext.photo_urls?.[0]
        });
        return true;
      }
      return false;
    }
  }

  /**
   * Validates downloaded model payload, applies descriptor, and reloads active FaceMatcher
   */
  private applyDownloadedModel(modelJson: any, memberContext?: any): boolean {
    if (!modelJson || !modelJson.name) {
      console.warn('[ModelSyncHandler] Invalid model JSON received (missing name)');
      return false;
    }

    const descriptor = modelJson.descriptor || memberContext?.descriptor;
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      console.warn(`[ModelSyncHandler] Invalid or missing 128D descriptor for model "${modelJson.name}"`);
      return false;
    }

    const personId = modelJson.memberId || memberContext?.id || `face-${Date.now()}`;
    const personName = modelJson.name;
    const personRole = modelJson.role || memberContext?.role || 'Resident';
    const accuracy = modelJson.accuracy !== undefined ? modelJson.accuracy : memberContext?.accuracy;
    const photoCount = modelJson.photoCount || memberContext?.photo_count;
    const imageUrl = memberContext?.photo_urls?.[0] || modelJson.imageUrl;

    const applied = this.faceEngine.applyModelDescriptor({
      id: personId,
      name: personName,
      notes: `${personRole} • Synced Model (${accuracy ? `${accuracy}% accuracy` : 'Active'})`,
      descriptor,
      accuracy,
      photoCount,
      imageUrl,
      trainingStats: modelJson.trainingStats
    });

    console.log(`[ModelSyncHandler] 🔄 Model for "${personName}" SWAPPED into active camera pipeline! (Accuracy: ${accuracy || 90}%, Descriptors: 128D)`);
    return Boolean(applied);
  }

  /**
   * Initial sync of all models registered in Supabase
   */
  public async syncAllModelsFromSupabase(): Promise<void> {
    if (!this.supabase) return;
    try {
      const { data: members, error } = await this.supabase
        .from('family_members')
        .select('*');

      if (!error && members && members.length > 0) {
        console.log(`[ModelSyncHandler] 🔍 Performing initial model sync for ${members.length} family member(s)...`);
        for (const member of members) {
          if (member.model_url) {
            await this.downloadAndApplyModelFromUrl(member.model_url, member);
          } else if (member.descriptor && Array.isArray(member.descriptor) && member.descriptor.length === 128) {
            this.faceEngine.applyModelDescriptor({
              id: member.id,
              name: member.name,
              role: member.role || 'Resident',
              descriptor: member.descriptor,
              accuracy: member.accuracy,
              photoCount: member.photo_count || member.photo_urls?.length,
              imageUrl: member.photo_urls?.[0]
            });
          }
        }
      }
    } catch (err) {
      console.warn('[ModelSyncHandler] Failed to sync models from Supabase:', (err as Error).message);
    }
  }
}
