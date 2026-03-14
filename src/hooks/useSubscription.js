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
    return subscription.status === 'trialing' && (subscription.hubs || []).includes(hubName);
  }

  return { subscription, loading, hasHub, canAddUser, isTrialing };
}
