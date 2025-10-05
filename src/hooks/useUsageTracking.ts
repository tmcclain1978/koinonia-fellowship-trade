import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription, TIER_LIMITS } from "./useSubscription";

interface Usage {
  feature: string;
  count: number;
  limit: number;
  unlimited: boolean;
}

export const useUsageTracking = () => {
  const [usage, setUsage] = useState<Record<string, Usage>>({});
  const { subscription } = useSubscription();

  useEffect(() => {
    if (subscription) {
      loadUsage();
    }
  }, [subscription]);

  const loadUsage = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data } = await supabase
        .from("usage_tracking")
        .select("*")
        .eq("user_id", session.user.id)
        .gte("period_start", periodStart.toISOString());

      if (data && subscription) {
        const limits = TIER_LIMITS[subscription.tier];
        const usageMap: Record<string, Usage> = {};

        // Initialize with limits
        Object.entries(limits).forEach(([feature, limit]) => {
          if (typeof limit === "number") {
            usageMap[feature] = {
              feature,
              count: 0,
              limit,
              unlimited: limit === -1,
            };
          }
        });

        // Update with actual usage
        data.forEach((record) => {
          if (usageMap[record.feature]) {
            usageMap[record.feature].count = record.count;
          }
        });

        setUsage(usageMap);
      }
    } catch (error) {
      console.error("Error loading usage:", error);
    }
  };

  const trackUsage = async (feature: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      const currentUsage = usage[feature];
      if (!currentUsage) return false;

      // Check if unlimited
      if (currentUsage.unlimited) return true;

      // Check if limit reached
      if (currentUsage.count >= currentUsage.limit) {
        return false;
      }

      // Increment usage
      const { error } = await supabase.functions.invoke("track-usage", {
        body: { feature, userId: session.user.id },
      });

      if (error) throw error;

      // Refresh usage
      await loadUsage();
      return true;
    } catch (error) {
      console.error("Error tracking usage:", error);
      return false;
    }
  };

  const canUseFeature = (feature: string): boolean => {
    const currentUsage = usage[feature];
    if (!currentUsage) return false;
    return currentUsage.unlimited || currentUsage.count < currentUsage.limit;
  };

  return {
    usage,
    trackUsage,
    canUseFeature,
    refresh: loadUsage,
  };
};