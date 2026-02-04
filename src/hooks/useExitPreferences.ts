import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

export interface ExitConditionPreset {
  id: string;
  type: 'percentage_loss' | 'percentage_gain' | 'price_below' | 'price_above' | 'time_based';
  value: number;
  action: 'close_all' | 'close_half' | 'trail_stop';
  orderType: 'MARKET' | 'LIMIT';
  limitOffset?: number;
}

export interface SavedPreset {
  id: string;
  name: string;
  conditions: ExitConditionPreset[];
  created_at: string;
}

export interface ExitPreferences {
  id: string;
  user_id: string;
  default_stop_loss_enabled: boolean;
  default_stop_loss_type: 'PERCENT' | 'DOLLAR';
  default_stop_loss_value: number;
  default_trailing_enabled: boolean;
  default_trailing_type: 'PERCENT' | 'DOLLAR';
  default_trailing_value: number;
  saved_exit_presets: SavedPreset[];
  default_phroureo_preset: string;
  created_at: string;
  updated_at: string;
}

// Type guard for validating stop loss type
function isValidStopLossType(value: string): value is 'PERCENT' | 'DOLLAR' {
  return value === 'PERCENT' || value === 'DOLLAR';
}

export function useExitPreferences() {
  const [preferences, setPreferences] = useState<ExitPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Load user preferences
  const loadPreferences = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_exit_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        // Safely parse and cast the data
        const stopLossType = isValidStopLossType(data.default_stop_loss_type || '') 
          ? data.default_stop_loss_type as 'PERCENT' | 'DOLLAR'
          : 'PERCENT';
        const trailingType = isValidStopLossType(data.default_trailing_type || '') 
          ? data.default_trailing_type as 'PERCENT' | 'DOLLAR'
          : 'PERCENT';
        
        // Safely parse saved_exit_presets from JSON
        let savedPresets: SavedPreset[] = [];
        if (data.saved_exit_presets && Array.isArray(data.saved_exit_presets)) {
          savedPresets = data.saved_exit_presets as unknown as SavedPreset[];
        }

        setPreferences({
          id: data.id,
          user_id: data.user_id,
          default_stop_loss_enabled: data.default_stop_loss_enabled ?? false,
          default_stop_loss_type: stopLossType,
          default_stop_loss_value: data.default_stop_loss_value ?? 20,
          default_trailing_enabled: data.default_trailing_enabled ?? false,
          default_trailing_type: trailingType,
          default_trailing_value: data.default_trailing_value ?? 10,
          saved_exit_presets: savedPresets,
          default_phroureo_preset: data.default_phroureo_preset ?? 'breakeven-lock',
          created_at: data.created_at,
          updated_at: data.updated_at,
        });
      } else {
        // Create default preferences
        const { data: newPrefs, error: createError } = await supabase
          .from('user_exit_preferences')
          .insert({
            user_id: user.id,
            default_stop_loss_enabled: false,
            default_stop_loss_type: 'PERCENT',
            default_stop_loss_value: 20,
            default_trailing_enabled: false,
            default_trailing_type: 'PERCENT',
            default_trailing_value: 10,
            saved_exit_presets: [] as unknown as Json,
          })
          .select()
          .single();

        if (createError) throw createError;
        
        setPreferences({
          id: newPrefs.id,
          user_id: newPrefs.user_id,
          default_stop_loss_enabled: newPrefs.default_stop_loss_enabled ?? false,
          default_stop_loss_type: 'PERCENT',
          default_stop_loss_value: newPrefs.default_stop_loss_value ?? 20,
          default_trailing_enabled: newPrefs.default_trailing_enabled ?? false,
          default_trailing_type: 'PERCENT',
          default_trailing_value: newPrefs.default_trailing_value ?? 10,
          saved_exit_presets: [],
          default_phroureo_preset: newPrefs.default_phroureo_preset ?? 'breakeven-lock',
          created_at: newPrefs.created_at,
          updated_at: newPrefs.updated_at,
        });
      }
    } catch (error: unknown) {
      console.error('Error loading exit preferences:', error);
      toast({
        title: "Error loading preferences",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Save preferences
  const savePreferences = async (updates: Partial<ExitPreferences>) => {
    if (!preferences) return false;

    setSaving(true);
    try {
      // Convert SavedPreset[] to Json for database storage
      const dbUpdates: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      
      // Handle saved_exit_presets conversion
      if (updates.saved_exit_presets) {
        dbUpdates.saved_exit_presets = updates.saved_exit_presets as unknown as Json;
      }

      const { error } = await supabase
        .from('user_exit_preferences')
        .update(dbUpdates)
        .eq('id', preferences.id);

      if (error) throw error;

      setPreferences(prev => prev ? { ...prev, ...updates } : null);
      
      toast({
        title: "Preferences saved",
        description: "Your exit strategy preferences have been saved.",
      });
      
      return true;
    } catch (error: unknown) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error saving preferences",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Save a new preset
  const savePreset = async (name: string, conditions: ExitConditionPreset[]) => {
    if (!preferences) return false;

    const newPreset: SavedPreset = {
      id: crypto.randomUUID(),
      name,
      conditions,
      created_at: new Date().toISOString(),
    };

    const updatedPresets = [...preferences.saved_exit_presets, newPreset];
    
    return await savePreferences({
      saved_exit_presets: updatedPresets,
    } as Partial<ExitPreferences>);
  };

  // Delete a preset
  const deletePreset = async (presetId: string) => {
    if (!preferences) return false;

    const updatedPresets = preferences.saved_exit_presets.filter(p => p.id !== presetId);
    
    return await savePreferences({
      saved_exit_presets: updatedPresets,
    } as Partial<ExitPreferences>);
  };

  // Update default stop loss settings
  const updateStopLoss = async (
    enabled: boolean,
    type: 'PERCENT' | 'DOLLAR',
    value: number
  ) => {
    return await savePreferences({
      default_stop_loss_enabled: enabled,
      default_stop_loss_type: type,
      default_stop_loss_value: value,
    });
  };

  // Update default trailing stop settings
  const updateTrailingStop = async (
    enabled: boolean,
    type: 'PERCENT' | 'DOLLAR',
    value: number
  ) => {
    return await savePreferences({
      default_trailing_enabled: enabled,
      default_trailing_type: type,
      default_trailing_value: value,
    });
  };

  return {
    preferences,
    loading,
    saving,
    savePreferences,
    savePreset,
    deletePreset,
    updateStopLoss,
    updateTrailingStop,
    reload: loadPreferences,
  };
}
