import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

export const FREE_PLAN_MAX_USERS = 10;

export function useSubscription(churchId) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!churchId) return;
    const unsub = onSnapshot(
      doc(db, 'churches', churchId, 'config', 'subscription'),
      (snap) => {
        if (snap.exists()) {
          setSubscription(snap.data());
        } else {
          // Default free plan
          setSubscription({ plan: 'free', hubs: [], maxUsers: FREE_PLAN_MAX_USERS, status: 'active', grandfathered: false });
        }
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, [churchId]);

  function hasHub(name) {
    if (!subscription) return false;
    if (subscription.grandfathered) return true;
    if (subscription.plan === 'all_in') return true;
    // Active 90-day trial — freeHubsSelected is null while trial is running
    if (subscription.freeHubsSelected === null && subscription.trialEndsAt && new Date(subscription.trialEndsAt) > new Date()) {
      return (subscription.trialHubs || []).includes(name);
    }
    // Post-trial: auto-selected free hubs
    if (Array.isArray(subscription.freeHubsSelected) && subscription.freeHubsSelected.includes(name)) return true;
    return (subscription.hubs || []).includes(name);
  }

  function canAddUser(currentUserCount) {
    if (!subscription) return currentUserCount < FREE_PLAN_MAX_USERS;
    if (subscription.grandfathered) return true;
    if (subscription.plan === 'team_unlimited' || subscription.plan === 'all_in') return true;
    return currentUserCount < (subscription.maxUsers || FREE_PLAN_MAX_USERS);
  }

  function isTrialing(hubName) {
    if (!subscription) return false;
    if (subscription.freeHubsSelected !== null) return false;
    if (!subscription.trialEndsAt || new Date(subscription.trialEndsAt) <= new Date()) return false;
    return (subscription.trialHubs || []).includes(hubName);
  }

  function trialDaysRemaining() {
    if (!subscription?.trialEndsAt || subscription.freeHubsSelected !== null) return 0;
    const ms = new Date(subscription.trialEndsAt) - new Date();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }

  return { subscription, loading, hasHub, canAddUser, isTrialing, trialDaysRemaining };
}
