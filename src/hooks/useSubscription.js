import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { onSnapshotResilient } from '../utils/resilientSnapshot.js';
import { db } from '../firebase.js';
import * as entitlement from '../lib/entitlement.js';

// COH-012 A.4.0a: the predicates live in src/lib/entitlement.js (one copy,
// shared with the server twin and pinned by functions/test/entitlement.test.mjs).
// This hook only subscribes to the document and binds it.

export function useSubscription(churchId) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!churchId) return;
    const unsub = onSnapshotResilient('subscription',
      doc(db, 'churches', churchId, 'config', 'subscription'),
      (snap) => {
        if (snap.exists()) {
          setSubscription(snap.data());
        } else {
          // No document: reads as lapsed (every real church has one — useAuth
          // writes it at signup). Nothing is granted by default.
          setSubscription({ plan: 'free', status: 'active', grandfathered: false });
        }
        setLoading(false);
      },
      (err, { willRetry } = {}) => {
        // While a retry is coming, warn (onSnapshotResilient reports it); a
        // permanent code or the give-up is a real failure.
        if (willRetry) console.warn('[ChurchOpsHub] subscription listener dropped (resubscribing):', err?.code);
        else console.error('[ChurchOpsHub] subscription listener failed', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [churchId]);

  const hasHub = (name) => entitlement.hasHub(subscription, name);
  const canAddUser = (currentUserCount) => entitlement.canAddUser(subscription, currentUserCount);
  const canCreate = () => entitlement.canCreate(subscription);
  const isTrialing = () => entitlement.isTrialing(subscription);
  const isLapsed = () => entitlement.isLapsed(subscription);
  const trialDaysRemaining = () => entitlement.trialDaysRemaining(subscription);

  return { subscription, loading, hasHub, canAddUser, canCreate, isTrialing, isLapsed, trialDaysRemaining };
}
