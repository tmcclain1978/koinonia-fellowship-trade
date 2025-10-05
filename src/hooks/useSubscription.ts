import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "free_user" | "basic" | "pro" | "enterprise";

interface Subscription {
  tier: SubscriptionTier;
  status: "active" | "cancelled" | "expired";
  endDate: string | null;
}

export const TIER_LIMITS = {
  free_user: {
    ai_analyses: 0,
    trading_signals: 0,
    auto_trading: false,
  },
  basic: {
    ai_analyses: 50,
    trading_signals: 150, // 5 per day * 30 days
    auto_trading: false,
  },
  pro: {
    ai_analyses: -1, // unlimited
    trading_signals: -1, // unlimited
    auto_trading: false,
  },
  enterprise: {
    ai_analyses: -1, // unlimited
    trading_signals: -1, // unlimited
    auto_trading: true,
  },
};

export const useSubscription = () => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Get user role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();

      // Get subscription details
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Map role to subscription tier
      const mapRoleToTier = (role: string | undefined): SubscriptionTier => {
        // Admins get enterprise-level access
        if (role === "admin") {
          return "enterprise";
        }
        if (role === "basic" || role === "pro" || role === "enterprise") {
          return role;
        }
        return "free_user";
      };

      if (subData) {
        setSubscription({
          tier: mapRoleToTier(roleData?.role),
          status: (subData.status === "active" || subData.status === "cancelled" || subData.status === "expired") 
            ? subData.status 
            : "active",
          endDate: subData.end_date,
        });
      } else {
        setSubscription({
          tier: mapRoleToTier(roleData?.role),
          status: "active",
          endDate: null,
        });
      }
    } catch (error) {
      console.error("Error loading subscription:", error);
    } finally {
      setLoading(false);
    }
  };

  const hasFeatureAccess = (feature: keyof typeof TIER_LIMITS.free_user): boolean => {
    if (!subscription) return false;
    const limits = TIER_LIMITS[subscription.tier];
    const value = limits[feature];
    if (typeof value === 'boolean') return value;
    return value === -1 || value > 0;
  };

  return {
    subscription,
    loading,
    hasFeatureAccess,
    refresh: loadSubscription,
  };
};