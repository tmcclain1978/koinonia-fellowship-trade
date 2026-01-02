import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "free_user" | "basic" | "pro" | "enterprise";

interface Subscription {
  tier: SubscriptionTier;
  status: "active" | "cancelled" | "expired";
  endDate: string | null;
  isFamilyMember?: boolean;
}

export const TIER_LIMITS = {
  free_user: {
    ai_analyses: 0,
    trading_signals: 0,
    auto_trading: false,
    koinonia_indicator: 0, // Requires $49 payment
  },
  basic: {
    ai_analyses: 50,
    trading_signals: 150, // 5 per day * 30 days
    auto_trading: false,
    koinonia_indicator: 0, // Requires $49 payment
  },
  pro: {
    ai_analyses: -1, // unlimited
    trading_signals: -1, // unlimited
    auto_trading: false,
    koinonia_indicator: 0, // Requires $49 payment
  },
  enterprise: {
    ai_analyses: -1, // unlimited
    trading_signals: -1, // unlimited
    auto_trading: true,
    koinonia_indicator: -1, // FREE for enterprise
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

      // Check if user is an active family member
      const { data: familyData } = await supabase
        .from("family_members")
        .select("*")
        .eq("member_user_id", session.user.id)
        .eq("status", "active")
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

      // Check if subscription is expired
      const isSubscriptionActive = (sub: any): boolean => {
        if (!sub) return false;
        if (sub.status !== "active") return false;
        if (!sub.end_date) return true; // No end date means active forever
        return new Date(sub.end_date) > new Date();
      };

      // Determine final tier based on role and active subscription
      let finalTier: SubscriptionTier = mapRoleToTier(roleData?.role);
      let finalStatus: "active" | "cancelled" | "expired" = "active";
      let finalEndDate: string | null = null;
      let isFamilyMember = false;

      // Family members get enterprise access
      if (familyData) {
        finalTier = "enterprise";
        finalStatus = "active";
        isFamilyMember = true;
      } else if (subData) {
        const subIsActive = isSubscriptionActive(subData);
        
        // If subscription is expired, downgrade to free_user unless they're admin
        if (!subIsActive && roleData?.role !== "admin") {
          finalTier = "free_user";
          finalStatus = "expired";
        } else {
          // Use subscription's plan name if active
          if (subData.plan_name === "basic" || subData.plan_name === "pro" || subData.plan_name === "enterprise") {
            finalTier = subData.plan_name;
          }
          finalStatus = subIsActive ? "active" : "expired";
        }
        
        finalEndDate = subData.end_date;
      }

      setSubscription({
        tier: finalTier,
        status: finalStatus,
        endDate: finalEndDate,
        isFamilyMember,
      });
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